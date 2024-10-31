/**
 * @file AI model type definitions
 * @description Core types for AI model interactions
 */

/**
 * Represents a single turn in a conversation
 */
export interface ConversationTurn {
    /** The role of the participant in the conversation */
    role: 'user' | 'assistant' | 'system';
    /** The content of the message */
    content: string;
}

/**
 * Structure for conversation examples
 */
export interface ConversationExample {
    turns: ConversationTurn[];
}

/**
 * Interface for chat model implementations
 */
export interface ChatModel {
    sendRequest(messages: ConversationTurn[], prompt: string): Promise<string>;
    getEmbedding?(text: string): Promise<number[]>;
}

/**
 * Configuration for model endpoints
 */
export interface ModelConfig {
    model: string;
    api?: string;
    url?: string;
}

/**
 * Store for embeddings with text keys
 */
export interface EmbeddingStore {
    [key: string]: number[];
}

/**
 * Interface for embedding model capabilities
 */
export interface EmbeddingModel {
    embed(text: string): Promise<number[]>;
}

/**
 * Common interface for all AI model implementations
 */
export interface AIModel {
    /** Sends a request to the model and gets a response */
    sendRequest(
        turns: ConversationTurn[],
        systemMessage?: string,
        stopSequence?: string | null
    ): Promise<string>;

    /** Optional embedding support */
    embed?(text: string): Promise<number[] | void>;
}
