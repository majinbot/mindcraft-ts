/**
 * @file Claude AI model integration
 * @description Handles communication with Anthropic's Claude API
 */

import Anthropic from '@anthropic-ai/sdk';

import { strictFormat } from '../utils/text';
import { getKey } from '../utils/keys';
import {ConversationTurn} from "../types/models";

/**
 * Configuration options for Claude model
 */
interface ClaudeConfig {
    /** Base URL for API requests */
    baseURL?: string;
    /** API key for authentication */
    apiKey?: string;
}

/**
 * Claude AI model wrapper
 */
export class Claude {
    private readonly anthropic: Anthropic;
    private readonly modelName: string;
    private static readonly DEFAULT_MODEL = "claude-3-sonnet-20240229";
    private static readonly MAX_TOKENS = 2048;

    /**
     * Creates a new Claude instance
     *
     * @param modelName - Name of the Claude model to use
     * @param url - Optional base URL for API requests
     */
    constructor(modelName?: string, url?: string) {
        const config: ClaudeConfig = {};

        if (url) {
            config.baseURL = url;
        }

        try {
            config.apiKey = getKey('ANTHROPIC_API_KEY');
        } catch (error) {
            throw new Error('Failed to initialize Claude: Missing API key');
        }

        this.modelName = modelName || Claude.DEFAULT_MODEL;
        this.anthropic = new Anthropic(config);
    }

    /**
     * Sends a request to the Claude API
     *
     * @param turns - Array of conversation turns
     * @param systemMessage - Optional system message for context
     * @returns The model's response text
     */
    async sendRequest(
        turns: ConversationTurn[],
        systemMessage?: string
    ): Promise<string> {
        const messages = this.formatMessages(turns);

        try {
            console.log('Awaiting Anthropic API response...');

            const response = await this.anthropic.messages.create({
                model: this.modelName,
                system: systemMessage,
                max_tokens: Claude.MAX_TOKENS,
                messages: messages as Anthropic.MessageParam[],
            });

            console.log('Response received.');
            return response.content[0].text;
        } catch (error) {
            this.handleError(error);
            return 'My brain disconnected, try again.';
        }
    }

    /**
     * Formats conversation turns for the API
     *
     * @param turns - Array of conversation turns
     * @returns Formatted messages for the API
     * @private
     */
    private formatMessages(turns: ConversationTurn[]): Anthropic.MessageParam[] {
        return strictFormat(turns).map(turn => ({
            role: turn.role === 'user' ? 'user' : 'assistant',
            content: turn.content
        }));
    }

    /**
     * Handles API errors
     *
     * @param error - The error to handle
     * @private
     */
    private handleError(error: unknown): void {
        if (error instanceof Anthropic.APIError) {
            console.error('Anthropic API Error:', {
                status: error.status,
                message: error.message,
            });
        } else {
            console.error('Unexpected error:', error);
        }
    }

    /**
     * Embeddings are not supported by Claude
     * @throws Error always
     */
    async embed(_text: string): Promise<never> {
        throw new Error('Embeddings are not supported by Claude.');
    }
}