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
