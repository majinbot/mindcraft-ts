import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { Examples } from '../utils/examples';
import {getCommand, getCommandDocs} from './commands';
import { getSkillDocs } from './library';
import { stringifyTurns } from '../utils/text';
import { Agent } from './index';
import { GroqCloud } from "../models/groq";
import { Claude } from "../models/claude";
import { HuggingFace } from "../models/huggingface";
import {HistoryTurn, Profile} from "./types";
import {ChatModel, EmbeddingModel, ModelConfig} from "../types/models";

/**
 * Structure for NPC goals
 */
interface NPCGoal {
    name: string;
    quantity: number;
}

/**
 * Handles prompt generation and model interactions for the agent
 */
export class Prompter {
    private readonly agent: Agent;
    private readonly profile: Profile;
    private convoExamples: Examples | null = null;
    private codingExamples: Examples | null = null;
    private readonly chatModel: ChatModel;
    private readonly embeddingModel: EmbeddingModel | null;
    private readonly cooldown: number;
    private lastPromptTime: number = 0;

    constructor(agent: Agent, fp: string) {
        this.agent = agent;
        this.profile = JSON.parse(readFileSync(fp, 'utf8'));
        const name = this.profile.name;

        const chatConfig = this.initializeChatConfig();
        this.chatModel = this.createModel(chatConfig);

        const embeddingConfig = this.initializeEmbeddingConfig(chatConfig);
        const embeddingChatModel = embeddingConfig ?
            this.createModel(embeddingConfig) :
            null;
        this.embeddingModel = this.asEmbeddingModel(embeddingChatModel);

        this.cooldown = this.profile.cooldown || 0;

        mkdirSync(`./bots/${name}`, { recursive: true });
        writeFileSync(
            `./bots/${name}/last_profile.json`,
            JSON.stringify(this.profile, null, 4)
        );
    }

    /**
     * Converts a ChatModel to an EmbeddingModel if it supports embeddings
     */
    private asEmbeddingModel(model: ChatModel | null): EmbeddingModel | null {
        // Early return if model or getEmbedding is not available
        const getEmbedding = model?.getEmbedding;
        if (!getEmbedding) return null;

        // Create adapter with the verified embedding function
        return {
            embed: getEmbedding.bind(model)
        };
    }

    /**
     * Initializes the chat model configuration
     */
    private initializeChatConfig(): ModelConfig {
        let chat = this.profile.model;
        if (typeof chat === 'string') {
            const api = this.detectAPI(chat);
            chat = { model: chat, api };
        }
        return chat as ModelConfig;
    }

    /**
     * Initializes the embedding model configuration
     */
    private initializeEmbeddingConfig(chatConfig: ModelConfig): ModelConfig | null {
        let embedding = this.profile.embedding;
        if (embedding === undefined) {
            if (chatConfig.api !== 'ollama') {
                return { api: chatConfig.api } as ModelConfig;
            }
            return { api: 'none' } as ModelConfig;
        }
        if (typeof embedding === 'string') {
            return { api: embedding } as ModelConfig;
        }
        return embedding as ModelConfig;
    }

    /**
     * Detects which API to use based on model name
     */
    private detectAPI(model: string): string {
        if (model.includes('gemini')) return 'google';
        if (model.includes('gpt') || model.includes('o1')) return 'openai';
        if (model.includes('claude')) return 'anthropic';
        if (model.includes('huggingface/')) return 'huggingface';
        if (model.includes('meta/') || model.includes('mistralai/') ||
            model.includes('replicate/')) return 'replicate';
        if (model.includes('groq/') || model.includes('groqcloud/')) return 'groq';
        return 'ollama';
    }

    /**
     * Creates a model instance based on configuration
     */
    private createModel(config: ModelConfig): ChatModel {
        const models: Record<string, () => ChatModel> = {
            anthropic: () => new Claude(config.model, config.url),
            groq: () => new GroqCloud(
                config.model.replace(/^groq(cloud)?\//, ''),
                config.url,
                this.profile.max_tokens || 8192
            ),
            huggingface: () => new HuggingFace(config.model, config.url)
        };

        const modelCreator = models[config.api!];
        if (!modelCreator) throw new Error(`Unknown API: ${config.api}`);
        return modelCreator();
    }

    /**
     * Gets the agent's name from the profile
     */
    getName(): string {
        return this.profile.name;
    }

    /**
     * Gets initial mode settings from the profile
     */
    getInitModes(): Record<string, boolean> | undefined {
        return this.profile.modes;
    }

    /**
     * Initializes conversation and coding examples
     */
    async initExamples(): Promise<void> {
        this.convoExamples = new Examples(this.embeddingModel);
        this.codingExamples = new Examples(this.embeddingModel);

        try {
            await Promise.all([
                this.convoExamples.load(this.profile.conversation_examples),
                this.codingExamples.load(this.profile.coding_examples)
            ]);
        } catch (err) {
            console.error('Failed to load examples:', err);
            this.convoExamples = new Examples(null);
            this.codingExamples = new Examples(null);
        }
    }

    /**
     * Replaces placeholder strings in prompts with actual content
     */
    private async replaceStrings(
        prompt: string,
        messages: HistoryTurn[] | null,
        examples: Examples | null = null,
        toSummarize: HistoryTurn[] = [],
        lastGoals: Record<string, boolean> | null = null
    ): Promise<string> {
        const replacements: [RegExp, () => string | Promise<string>][] = [
            [/\$NAME/g, () => this.agent.name],
            [/\$STATS/g, async () => await getCommand('!stats')!.perform(this.agent) || ''],
            [/\$INVENTORY/g, async () => await getCommand('!inventory')!.perform(this.agent) || ''],
            [/\$COMMAND_DOCS/g, () => getCommandDocs()],
            [/\$CODE_DOCS/g, () => getSkillDocs()],
            [/\$EXAMPLES/g, async () => examples ? await examples.createExampleMessage(messages || []) : ''],
            [/\$MEMORY/g, () => this.agent.history.memory],
            [/\$TO_SUMMARIZE/g, () => stringifyTurns(toSummarize)],
            [/\$CONVO/g, () => messages ? `Recent conversation:\n${stringifyTurns(messages)}` : ''],
            [/\$SELF_PROMPT/g, () => this.agent.self_prompter.on ?
                `YOUR CURRENT ASSIGNED GOAL: "${this.agent.self_prompter.prompt}"\n` : ''],
            [/\$LAST_GOALS/g, () => this.formatLastGoals(lastGoals)],
        ];

        let result = prompt;
        for (const [pattern, replacer] of replacements) {
            if (pattern.test(result)) {
                result = result.replace(pattern, await replacer());
            }
        }

        return result;
    }

    /**
     * Formats the history of completed goals
     */
    private formatLastGoals(lastGoals: Record<string, boolean> | null): string {
        if (!lastGoals) return '';
        return Object.entries(lastGoals)
            .map(([goal, success]) =>
                `You recently ${success ? 'successfully completed' : 'failed to complete'} the goal ${goal}.`)
            .join('\n');
    }

    /**
     * Enforces cooldown between prompt requests
     */
    private async checkCooldown(): Promise<void> {
        const elapsed = Date.now() - this.lastPromptTime;
        if (elapsed < this.cooldown && this.cooldown > 0) {
            await new Promise(r => setTimeout(r, this.cooldown - elapsed));
        }
        this.lastPromptTime = Date.now();
    }

    /**
     * Sends a conversation prompt to the model
     */
    async promptConvo(messages: HistoryTurn[]): Promise<string> {
        await this.checkCooldown();
        const prompt = await this.replaceStrings(
            this.profile.conversing,
            messages,
            this.convoExamples
        );
        return await this.chatModel.sendRequest(messages, prompt);
    }

    /**
     * Sends a coding prompt to the model
     */
    async promptCoding(messages: HistoryTurn[]): Promise<string> {
        await this.checkCooldown();
        const prompt = await this.replaceStrings(
            this.profile.coding,
            messages,
            this.codingExamples
        );
        return await this.chatModel.sendRequest(messages, prompt);
    }

    /**
     * Sends a memory saving prompt to the model
     */
    async promptMemSaving(toSummarize: HistoryTurn[]): Promise<string> {
        await this.checkCooldown();
        const prompt = await this.replaceStrings(
            this.profile.saving_memory,
            null,
            null,
            toSummarize
        );
        return await this.chatModel.sendRequest([], prompt);
    }

    /**
     * Sends a goal setting prompt to the model
     */
    async promptGoalSetting(
        messages: HistoryTurn[],
        lastGoals: Record<string, boolean>
    ): Promise<NPCGoal | null> {
        const systemMessage = await this.replaceStrings(
            this.profile.goal_setting,
            messages
        );

        let userMessage = 'Use the below info to determine what goal to target next\n\n' +
            '$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO';
        userMessage = await this.replaceStrings(
            userMessage,
            messages,
            null,
            [],
            lastGoals
        );

        const response = await this.chatModel.sendRequest(
            [{ role: 'user', content: userMessage }],
            systemMessage
        );

        try {
            const data = response.split('```')[1].replace('json', '').trim();
            const goal = JSON.parse(data) as NPCGoal;

            if (!goal?.name || !goal?.quantity || isNaN(goal.quantity)) {
                console.log('Invalid goal format:', response);
                return null;
            }

            goal.quantity = parseInt(goal.quantity.toString());
            return goal;

        } catch (err) {
            console.log('Failed to parse goal:', response, err);
            return null;
        }
    }
}