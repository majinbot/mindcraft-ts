import OpenAI from 'openai';
import { getKey, hasKey } from '../utils/keys';
import { BaseModel, ModelConfig, Turn } from '../types/model';

interface ChatCompletionParams {
    model: string;
    messages: Turn[];
    stop?: string;
}

export class OpenAi implements BaseModel {
    private readonly model_name: string;
    private openai: OpenAI;

    constructor({ model_name, url }: ModelConfig) {
        this.model_name = model_name;

        const config = {
            apiKey: getKey('OPENAI_API_KEY'),
            baseURL: url,
            organization: hasKey('OPENAI_ORG_ID') ? getKey('OPENAI_ORG_ID') : undefined,
        };

        this.openai = new OpenAI(config);
    }

    async sendRequest(turns: Turn[], systemMessage: string, stop_seq = '***'): Promise<string> {
        const messages = [
            { role: 'system' as const, content: systemMessage },
            ...turns
        ];

        const pack: ChatCompletionParams = {
            model: this.model_name || "gpt-3.5-turbo",
            messages,
            ...(this.model_name.includes('o1') ? {} : { stop: stop_seq })
        };

        try {
            console.log('Awaiting openai api response...');
            const completion = await this.openai.chat.completions.create(pack);

            if (completion.choices[0].finish_reason === 'length') {
                throw new Error('Context length exceeded');
            }

            console.log('Received.');
            return completion.choices[0].message.content || '';
        } catch (err) {
            const error = err as Error;
            if ((error.message === 'Context length exceeded' ||
                    (error as any).code === 'context_length_exceeded') &&
                turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            }

            console.error('OpenAI API error:', err);
            return 'My brain disconnected, try again.';
        }
    }

    async embed(text: string): Promise<number[]> {
        const embedding = await this.openai.embeddings.create({
            model: this.model_name || "text-embedding-ada-002",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
    }
}