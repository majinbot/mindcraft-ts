/**
 * @file Groq Cloud API implementation
 */
import Groq from 'groq-sdk';
import { getKey } from '../utils/keys';
import {
    AIModel,
    ConversationTurn
} from '../types/models';
import {
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam
} from "groq-sdk/resources/chat";
import {ChatCompletionCreateParamsStreaming} from "groq-sdk/resources/chat/completions";

export class GroqCloud implements AIModel {
    private readonly groq: Groq;
    private readonly modelName: string;
    private readonly maxTokens: number;
    private static readonly DEFAULT_MODEL = "mixtral-8x7b-32768";

    constructor(
        modelName?: string,
        url?: string,
        maxTokens: number = 16384
    ) {
        if (url) {
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");
        }

        this.modelName = modelName || GroqCloud.DEFAULT_MODEL;
        this.maxTokens = maxTokens;
        this.groq = new Groq({
            apiKey: getKey('GROQCLOUD_API_KEY')
        });
    }

    /**
     * Converts ConversationTurn to Groq's ChatCompletionMessageParam
     */
    private convertToGroqMessage(
        turn: ConversationTurn
    ): ChatCompletionMessageParam {
        // Convert the turn into a properly typed message based on role
        switch (turn.role) {
            case 'system':
                return {
                    role: 'system',
                    content: turn.content
                } as ChatCompletionSystemMessageParam;

            case 'assistant':
                return {
                    role: 'assistant',
                    content: turn.content
                } as ChatCompletionAssistantMessageParam;

            case 'user':
                return {
                    role: 'user',
                    content: turn.content
                } as ChatCompletionUserMessageParam;

            default:
                throw new Error(`Unsupported role: ${turn.role}`);
        }
    }

    async sendRequest(
        turns: ConversationTurn[],
        systemMessage?: string,
        stopSeq: string | null = null
    ): Promise<string> {
        // Convert turns to properly typed messages
        const messages: ChatCompletionMessageParam[] = systemMessage
            ? [
                { role: 'system', content: systemMessage } as ChatCompletionSystemMessageParam,
                ...turns.map(turn => this.convertToGroqMessage(turn))
            ]
            : turns.map(turn => this.convertToGroqMessage(turn));

        try {
            console.log("Awaiting Groq response...");
            const completion = await this.groq.chat.completions.create({
                messages,
                model: this.modelName,
                temperature: 0.2,
                max_tokens: this.maxTokens,
                top_p: 1,
                stream: true,
                stop: stopSeq,
            } as ChatCompletionCreateParamsStreaming);

            let response = "";
            for await (const chunk of completion) {
                response += chunk.choices[0]?.delta?.content || '';
            }

            return response;
        } catch (error) {
            console.error("Groq API Error:", error);
            return "My brain just kinda stopped working. Try again.";
        }
    }

    async embed(text: string): Promise<void> {
        console.log(
            "There is no support for embeddings in Groq support. " +
            "However, the following text was provided: " + text
        );
    }
}