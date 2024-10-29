/**
 * @file Text processing utilities for conversation management
 * @description Handles conversation turn formatting and manipulation for various LLM interfaces
 */

import {ConversationTurn} from "../types/models";

/**
 * Converts an array of conversation turns into a formatted string
 *
 * @param turns - Array of conversation turns to stringify
 * @returns Formatted string representation of the conversation
 *
 * @improvements
 * - Added type safety with interfaces
 * - Improved string concatenation efficiency with array join
 * - Added input validation
 */
export function stringifyTurns(turns: ConversationTurn[]): string {
    if (!Array.isArray(turns)) {
        throw new Error('Invalid input: turns must be an array');
    }

    const formatted = turns.map(turn => {
        switch (turn.role) {
            case 'assistant':
                return `\nYour output:\n${turn.content}`;
            case 'system':
                return `\nSystem output: ${turn.content}`;
            case 'user':
                return `\nUser input: ${turn.content}`;
            default:
                return ''; // TypeScript ensures we won't reach here due to type safety
        }
    });

    return formatted.join('').trim();
}

/**
 * Converts conversation turns into a single prompt string
 *
 * @param turns - Array of conversation turns
 * @param system - Optional system message to prepend
 * @param stop_seq - Sequence to use as separator between messages
 * @param model_nickname - Name to use for assistant messages
 * @returns Formatted prompt string
 *
 * @improvements
 * - Added type safety
 * - Added input validation
 * - Improved string concatenation efficiency
 */
export function toSinglePrompt(
    turns: ConversationTurn[],
    system: string | null = null,
    stop_seq: string = '***',
    model_nickname: string = 'assistant'
): string {
    if (!Array.isArray(turns)) {
        throw new Error('Invalid input: turns must be an array');
    }

    const parts: string[] = [];

    if (system) {
        parts.push(`${system}${stop_seq}`);
    }

    let lastRole = '';

    turns.forEach((message) => {
        const role = message.role === 'assistant' ? model_nickname : message.role;
        parts.push(`${role}: ${message.content}${stop_seq}`);
        lastRole = role;
    });

    if (lastRole !== model_nickname) {
        parts.push(`${model_nickname}: `);
    }

    return parts.join('');
}

/**
 * Formats conversation turns for stricter models (Anthropic/Llama)
 *
 * @param turns - Array of conversation turns to format
 * @returns Formatted array of turns
 *
 * @improvements
 * - Added type safety
 * - Added input validation
 * - Improved message combination logic
 * - Added safeguards against empty messages
 */
export function strictFormat(turns: ConversationTurn[]): ConversationTurn[] {
    if (!Array.isArray(turns)) {
        throw new Error('Invalid input: turns must be an array');
    }

    const filler: ConversationTurn = { role: 'user', content: '_' };
    const messages: ConversationTurn[] = [];
    let prevRole: string | null = null;

    for (const msg of turns) {
        const formattedMsg: ConversationTurn = {
            role: msg.role === 'system' ? 'user' : msg.role,
            content: msg.role === 'system'
                ? 'SYSTEM: ' + msg.content.trim()
                : msg.content.trim()
        };

        if (formattedMsg.role === prevRole && formattedMsg.role === 'assistant') {
            messages.push({ ...filler });
            messages.push(formattedMsg);
        } else if (formattedMsg.role === prevRole && messages.length > 0) {
            messages[messages.length - 1].content += '\n' + formattedMsg.content;
        } else {
            messages.push(formattedMsg);
        }

        prevRole = formattedMsg.role;
    }

    // Ensure conversation starts with user message for Anthropic
    if (messages.length > 0 && messages[0].role !== 'user') {
        messages.unshift({ ...filler });
    }

    // Ensure conversation isn't empty
    if (messages.length === 0) {
        messages.push({ ...filler });
    }

    return messages;
}