/**
 * Represents a conversation turn in the chat system
 */
export interface Turn {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

/**
 * Interface for embedding models that can generate vector representations
 */
export interface EmbeddingModel {
    embed: (text: string) => Promise<number[]>;
}

export interface ModelConfig {
    model_name: string;
    url?: string;
    max_tokens?: number;
}

export interface BaseModel {
    sendRequest(turns: Turn[], systemMessage: string): Promise<string>;
    embed?(text: string): Promise<number[]>;
}

export interface ChatMessage {
    role: string;
    content: string;
}

export interface ChatResponse {
    message: {
        content: string;
    };
}

export type EmbeddingResponse = {
    embedding: number[];
};