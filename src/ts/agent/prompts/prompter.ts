import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { Examples } from '../../utils/examples';
import { getCommandDocs, getCommand } from '../commands';
import { getSkillDocs } from '../mc/player/skills';
import { stringifyTurns } from '../../utils/text';
import type { ProfileConfig, Goal, LastGoals } from '../../types/prompter';
import type { ChatMessage } from '../../types/mc/chat';
import type { Agent } from '..';
import type { LLMInterface, ModelConfig, LLMProvider } from '../../types/llm';

// Import all supported models
import { Gemini } from '../models/gemini';
import { GPT } from '../models/gpt';
import { Claude } from '../models/claude';
import { ReplicateAPI } from '../models/replicate';
import { LocalLLM } from '../../models/local';
import { GroqCloudAPI } from '../models/groq';
import { HuggingFace } from '../../models/huggingface';

export class Prompter {
    private agent: Agent;
    private profile: ProfileConfig;
    private convoExamples: Examples | null = null;
    private codingExamples: Examples | null = null;
    private chatModel: LLMInterface;
    private embeddingModel: LLMInterface | null;
    private cooldown: number;
    private lastPromptTime: number = 0;

    constructor(agent: Agent, filePath: string) {
        this.agent = agent;
        this.profile = JSON.parse(readFileSync(filePath, 'utf8'));
        this.cooldown = this.profile.cooldown ?? 0;

        const chatConfig = this.initializeChatConfig();
        console.log('Using chat settings:', chatConfig);

        this.chatModel = this.createModel(chatConfig);
        this.embeddingModel = this.initializeEmbeddingModel();
        this.setupBotDirectory();
    }

    getName(): string {
        return this.profile.name;
    }

    getInitModes(): string[] | undefined {
        return this.profile.modes;
    }

    async initExamples(): Promise<void> {
        this.convoExamples = new Examples(this.embeddingModel);
        this.codingExamples = new Examples(this.embeddingModel);
        
        await Promise.all([
            this.convoExamples.load(this.profile.conversationExamples),
            this.codingExamples.load(this.profile.codingExamples),
        ]);
    }

    private initializeChatConfig(): ModelConfig {
        let chat = this.profile.model;
        if (typeof chat === 'string') {
            const api = this.determineAPI(chat);
            return { model: chat, api };
        }
        return chat as ModelConfig;
    }

    private determineAPI(model: string): LLMProvider {
        if (model.includes('gemini')) return 'google';
        if (model.includes('gpt') || model.includes('o1')) return 'openai';
        if (model.includes('claude')) return 'anthropic';
        if (model.includes('huggingface/')) return 'huggingface';
        if (model.includes('meta/') || model.includes('mistralai/') || model.includes('replicate/')) return 'replicate';
        if (model.includes('groq/') || model.includes('groqcloud/')) return 'groq';
        return 'ollama';
    }

    private createModel(config: ModelConfig): LLMInterface {
        switch (config.api) {
            case 'google':
                return new Gemini(config.model, config.url);
            case 'openai':
                return new GPT(config.model, config.url);
            case 'anthropic':
                return new Claude(config.model, config.url);
            case 'replicate':
                return new ReplicateAPI(config.model, config.url);
            case 'ollama':
                return new LocalLLM(config.model);
            case 'groq':
                const model = config.model.replace('groq/', '').replace('groqcloud/', '');
                return new GroqCloudAPI(model, config.url, config.maxTokens ?? 8192);
            case 'huggingface':
                return new HuggingFace(config.model);
            default:
                throw new Error(`Unknown API: ${config.api}`);
        }
    }

    private initializeEmbeddingModel(): LLMInterface | null {
        let embedding = this.profile.embedding;
        if (embedding === undefined) {
            const chatConfig = this.initializeChatConfig();
            if (chatConfig.api !== 'ollama') {
                embedding = { api: chatConfig.api };
            } else {
                embedding = { api: 'none' };
            }
        } else if (typeof embedding === 'string') {
            embedding = { api: embedding };
        }

        console.log('Using embedding settings:', embedding);

        if (embedding.api === 'google') {
            return new Gemini(embedding.model, embedding.url);
        } else if (embedding.api === 'openai') {
            return new GPT(embedding.model, embedding.url);
        } else if (embedding.api === 'replicate') {
            return new ReplicateAPI(embedding.model, embedding.url);
        } else if (embedding.api === 'ollama') {
            return new LocalLLM(embedding.model);
        } else {
            console.log('Unknown embedding: ', embedding ? embedding.api : '[NOT SPECIFIED]', '. Using word overlap.');
            return null;
        }
    }

    private setupBotDirectory(): void {
        const botPath = `./bots/${this.profile.name}`;
        mkdirSync(botPath, { recursive: true });
        writeFileSync(
            `${botPath}/last_profile.json`,
            JSON.stringify(this.profile, null, 4)
        );
    }

    async replaceStrings(
        prompt: string,
        messages: ChatMessage[] | null,
        examples: Examples | null = null,
        toSummarize: ChatMessage[] = [],
        lastGoals: LastGoals | null = null
    ): Promise<string> {
        if (prompt.includes('$COMMANDS')) {
            prompt = prompt.replaceAll('$COMMANDS', getCommandDocs());
        }
        if (prompt.includes('$SKILLS')) {
            prompt = prompt.replaceAll('$SKILLS', getSkillDocs());
        }
        if (prompt.includes('$EXAMPLES') && examples && messages) {
            const relevantExamples = await examples.getRelevant(messages);
            prompt = prompt.replaceAll('$EXAMPLES', relevantExamples);
        }
        if (prompt.includes('$CONVO') && messages) {
            prompt = prompt.replaceAll('$CONVO', stringifyTurns(messages));
        }
        if (prompt.includes('$SUMMARY') && toSummarize.length > 0) {
            prompt = prompt.replaceAll('$SUMMARY', stringifyTurns(toSummarize));
        }
        if (prompt.includes('$STATS') && this.agent.bot) {
            const stats = this.agent.bot.getStats();
            prompt = prompt.replaceAll('$STATS', stats);
        }
        if (prompt.includes('$INVENTORY') && this.agent.bot) {
            const inventory = this.agent.bot.getInventory();
            prompt = prompt.replaceAll('$INVENTORY', inventory);
        }
        if (prompt.includes('$SELF_PROMPT')) {
            const selfPrompt = this.agent.selfPrompter.on 
                ? `YOUR CURRENT ASSIGNED GOAL: "${this.agent.selfPrompter.prompt}"\n` 
                : '';
            prompt = prompt.replaceAll('$SELF_PROMPT', selfPrompt);
        }
        if (prompt.includes('$LAST_GOALS') && lastGoals) {
            let goalText = '';
            for (const [goal, success] of Object.entries(lastGoals)) {
                goalText += success
                    ? `You recently successfully completed the goal ${goal}.\n`
                    : `You recently failed to complete the goal ${goal}.\n`;
            }
            prompt = prompt.replaceAll('$LAST_GOALS', goalText.trim());
        }
        if (prompt.includes('$BLUEPRINTS')) {
            if (this.agent.npc.constructions) {
                const blueprints = Object.keys(this.agent.npc.constructions).join(', ');
                prompt = prompt.replaceAll('$BLUEPRINTS', blueprints);
            }
        }

        const remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }
        return prompt;
    }

    private async checkCooldown(): Promise<void> {
        const elapsed = Date.now() - this.lastPromptTime;
        if (elapsed < this.cooldown && this.cooldown > 0) {
            await new Promise(r => setTimeout(r, this.cooldown - elapsed));
        }
        this.lastPromptTime = Date.now();
    }

    async promptConvo(messages: ChatMessage[]): Promise<string> {
        await this.checkCooldown();
        let prompt = this.profile.conversing;
        prompt = await this.replaceStrings(prompt, messages, this.convoExamples);
        return await this.chatModel.sendRequest(messages, prompt);
    }

    async promptCoding(messages: ChatMessage[]): Promise<string> {
        await this.checkCooldown();
        let prompt = this.profile.coding;
        prompt = await this.replaceStrings(prompt, messages, this.codingExamples);
        return await this.chatModel.sendRequest(messages, prompt);
    }

    async promptMemSaving(toSummarize: ChatMessage[]): Promise<string> {
        await this.checkCooldown();
        let prompt = this.profile.savingMemory;
        prompt = await this.replaceStrings(prompt, null, null, toSummarize);
        return await this.chatModel.sendRequest([], prompt);
    }

    async promptGoalSetting(messages: ChatMessage[], lastGoals: LastGoals): Promise<Goal | null> {
        let systemMessage = this.profile.goalSetting;
        systemMessage = await this.replaceStrings(systemMessage, messages);

        let userMessage = 'Use the below info to determine what goal to target next\n\n';
        userMessage += '$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO';
        userMessage = await this.replaceStrings(userMessage, messages, null, [], lastGoals);
        
        const userMessages: ChatMessage[] = [{
            role: 'user',
            content: userMessage
        }];

        const res = await this.chatModel.sendRequest(userMessages, systemMessage);

        try {
            const data = res.split('```')[1].replace('json', '').trim();
            const goal = JSON.parse(data) as Goal;
            
            if (!goal?.name || !goal?.quantity || isNaN(parseInt(String(goal.quantity)))) {
                console.log('Failed to set goal:', res);
                return null;
            }
            
            goal.quantity = parseInt(String(goal.quantity));
            return goal;
        } catch (err) {
            console.log('Failed to parse goal:', res, err);
            return null;
        }
    }
}
