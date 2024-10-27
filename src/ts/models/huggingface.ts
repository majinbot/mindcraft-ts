import { HfInference } from "@huggingface/inference";
import { toSinglePrompt } from '../utils/text';
import { getKey } from '../utils/keys';
import { BaseModel, ModelConfig, Turn } from '../types/model';

export interface HFChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface HFChatChunk {
    choices: Array<{
        delta?: {
            content?: string;
        };
    }>;
}

export class HuggingFace implements BaseModel {
    private readonly modelName: string;
    private readonly huggingface: HfInference;
    private readonly STOP_SEQ = '***';
    private readonly DEFAULT_MODEL = 'meta-llama/Meta-Llama-3-8B';

    constructor({ model_name, url }: ModelConfig) {
        this.modelName = model_name.replace('huggingface/', '');

        if (url) {
            console.warn("Hugging Face doesn't support custom urls!");
        }

        this.huggingface = new HfInference(getKey('HUGGINGFACE_API_KEY'));
    }

    async sendRequest(turns: Turn[], systemMessage: string): Promise<string> {
        const prompt = toSinglePrompt(turns, null, this.STOP_SEQ);
        const model = this.modelName || this.DEFAULT_MODEL;
        const input = systemMessage ? `${systemMessage}\n${prompt}` : prompt;

        try {
            console.log('Awaiting Hugging Face API response...');
            let response = '';

            const message: HFChatMessage = {
                role: "user",
                content: input
            };

            const stream = this.huggingface.chatCompletionStream({
                model,
                messages: [message]
            });

            for await (const chunk of stream) {
                const typedChunk = chunk as HFChatChunk;
                response += typedChunk.choices[0]?.delta?.content ?? "";
            }

            console.log('Received.');
            return response;
        } catch (err) {
            console.error('HuggingFace API error:', err instanceof Error ? err.message : String(err));
            return 'My brain disconnected, try again.';
        }
    }

    async embed(_text: string): Promise<never> {
        throw new Error('Embeddings are not supported by HuggingFace.');
    }
}