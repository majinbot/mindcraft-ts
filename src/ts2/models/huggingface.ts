/**
 * @file HuggingFace API implementation
 */
import { HfInference } from "@huggingface/inference";
import { toSinglePrompt } from '../utils/text';
import { getKey } from '../utils/keys';
import {
    AIModel,
    ConversationTurn
} from '../types/models';

export class HuggingFace implements AIModel {
    private readonly huggingface: HfInference;
    private readonly modelName: string;
    private static readonly DEFAULT_MODEL = 'meta-llama/Meta-Llama-3-8B';
    private static readonly STOP_SEQUENCE = '***';

    constructor(modelName: string, url?: string) {
        if (url) {
            console.warn("Hugging Face doesn't support custom urls!");
        }

        this.modelName = modelName.replace('huggingface/', '') || HuggingFace.DEFAULT_MODEL;
        this.huggingface = new HfInference(getKey('HUGGINGFACE_API_KEY'));
    }

    async sendRequest(
        turns: ConversationTurn[],
        systemMessage?: string
    ): Promise<string> {
        const prompt = toSinglePrompt(turns, null, HuggingFace.STOP_SEQUENCE);
        const input = systemMessage ? `${systemMessage}\n${prompt}` : prompt;

        try {
            console.log('Awaiting Hugging Face API response...');
            let response = '';

            const stream = this.huggingface.chatCompletionStream({
                model: this.modelName,
                messages: [{role: "user", content: input}]
            });

            for await (const chunk of stream) {
                response += chunk.choices[0]?.delta?.content || '';
            }

            console.log('Received.');
            return response;

        } catch (error) {
            console.error('HuggingFace API Error:', error);
            return 'My brain disconnected, try again.';
        }
    }

    async embed(text: string): Promise<never> {
        throw new Error('Embeddings are not supported by HuggingFace.');
    }
}