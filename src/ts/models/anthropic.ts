import { Anthropic as AnthropicClient, ClientOptions } from '@anthropic-ai/sdk';
import { strictFormat } from '../utils/text';
import { getKey } from '../utils/keys';
import { BaseModel, ModelConfig, Turn } from '../types/model';

export class Anthropic implements BaseModel {
    private readonly model: string;
    private anthropic: AnthropicClient;

    constructor({ model_name, url }: ModelConfig) {
        this.model = model_name;

        const config: ClientOptions = {
            apiKey: getKey('ANTHROPIC_API_KEY')
        };

        if (url) {
            config.baseURL = url;
        }

        this.anthropic = new AnthropicClient(config);
    }

    async sendRequest(turns: Turn[], systemMessage: string): Promise<string> {
        const messages = strictFormat(turns);

        try {
            console.log('Awaiting anthropic api response...');

            const response = await this.anthropic.messages.create({
                model: this.model || "claude-3-sonnet-20240229",
                system: systemMessage,
                max_tokens: 2048,
                messages: messages.map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                })),
            });

            console.log('Received.');
            return response.content[0].text;
        } catch (err) {
            console.error('Anthropic API error:', err);
            return 'My brain disconnected, try again.';
        }
    }

    async embed(_text: string): Promise<never> {
        throw new Error('Embeddings are not supported by Claude.');
    }
}