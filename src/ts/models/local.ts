import { strictFormat } from '../utils/text';
import { BaseModel, ModelConfig, Turn, ChatResponse, EmbeddingResponse } from '../types/model';

export interface OllamaRequest {
    model: string;
    messages?: Array<{ role: string; content: string }>;
    prompt?: string;
    stream?: boolean;
}

export class LocalLLM implements BaseModel {
    private readonly modelName: string;
    private readonly url: string;
    private readonly chatEndpoint = '/api/chat';
    private readonly embeddingEndpoint = '/api/embeddings';
    private readonly DEFAULT_CHAT_MODEL = 'llama3';
    private readonly DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

    constructor({ model_name, url }: ModelConfig) {
        this.modelName = model_name;
        this.url = url || 'http://127.0.0.1:11434';
    }

    async sendRequest(turns: Turn[], systemMessage: string): Promise<string> {
        const model = this.modelName || this.DEFAULT_CHAT_MODEL;
        const messages = strictFormat(turns);

        if (systemMessage) {
            messages.unshift({ role: 'system', content: systemMessage });
        }

        try {
            console.log(`Awaiting local response... (model: ${model})`);

            const request: OllamaRequest = {
                model,
                messages,
                stream: false
            };

            const response = await this.send<ChatResponse>(
                this.chatEndpoint,
                request
            );

            if (!response?.message?.content) {
                throw new Error('Invalid response from Ollama');
            }

            return response.message.content;
        } catch (err) {
            const error = err as Error;
            if (error.message.toLowerCase().includes('context length') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return this.sendRequest(turns.slice(1), systemMessage);
            }

            console.error('Local model error:', error.message);
            return 'My brain disconnected, try again.';
        }
    }

    async embed(text: string): Promise<number[]> {
        if (!text) {
            return [];
        }

        try {
            const model = this.modelName || this.DEFAULT_EMBEDDING_MODEL;
            const request: OllamaRequest = {
                model,
                prompt: text
            };

            const response = await this.send<EmbeddingResponse>(
                this.embeddingEndpoint,
                request
            );

            if (!Array.isArray(response?.embedding)) {
                throw new Error('Invalid embedding response');
            }

            return response.embedding;
        } catch (err) {
            console.error('Embedding error:', err instanceof Error ? err.message : String(err));
            return [];
        }
    }

    private async send<T>(endpoint: string, body: OllamaRequest): Promise<T> {
        const url = new URL(endpoint, this.url);
        const headers = new Headers({
            'Content-Type': 'application/json'
        });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`Ollama Status: ${response.status} - ${await response.text()}`);
            }

            return await response.json() as T;
        } catch (err) {
            console.error('Failed to send Ollama request:', err instanceof Error ? err.message : String(err));
            throw err;
        }
    }
}