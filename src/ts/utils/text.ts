import { Turn } from '../types';

/**
 * Converts conversation turns into a formatted string
 * @param turns - Array of conversation turns to format
 * @returns Formatted string representation of the conversation
 */
export function stringifyTurns(turns: Turn[]): string {
    return turns.map(turn => {
        if (turn.role === 'assistant') {
            return `\nYour output:\n${turn.content}`;
        } else if (turn.role === 'system') {
            return `\nSystem output: ${turn.content}`;
        } else {
            return `\nUser input: ${turn.content}`;
        }
    }).join('').trim();
}

/**
 * Converts conversation turns into a single prompt string
 * @param turns - Array of conversation turns
 * @param system - Optional system message to prepend
 * @param stop_seq - Sequence to use as separator
 * @param model_nickname - Name to use for assistant messages
 */
export function toSinglePrompt(
    turns: Turn[],
    system: string | null = null,
    stop_seq: string = '***',
    model_nickname: string = 'assistant'
): string {
    let prompt = system ? `${system}${stop_seq}` : '';
    let role = '';

    turns.forEach((message) => {
        role = message.role === 'assistant' ? model_nickname : message.role;
        prompt += `${role}: ${message.content}${stop_seq}`;
    });

    if (role !== model_nickname) {
        prompt += `${model_nickname}: `;
    }

    return prompt;
}

/**
 * Formats turns for stricter models (Anthropic/Llama)
 * @param turns - Array of conversation turns to format
 * @returns Formatted array of turns
 */
export function strictFormat(turns: Turn[]): Turn[] {
    const messages: Turn[] = [];
    const filler: Turn = { role: 'user', content: '_' };
    let prev_role: string | null = null;

    for (const msg of turns) {
        const formattedMsg: Turn = {
            role: msg.role === 'system' ? 'user' : msg.role,
            content: msg.role === 'system'
                ? 'SYSTEM: ' + msg.content.trim()
                : msg.content.trim()
        };

        if (formattedMsg.role === prev_role && formattedMsg.role === 'assistant') {
            messages.push(filler, formattedMsg);
        } else if (formattedMsg.role === prev_role) {
            messages[messages.length - 1].content += '\n' + formattedMsg.content;
        } else {
            messages.push(formattedMsg);
        }

        prev_role = formattedMsg.role;
    }

    if (messages.length === 0 || messages[0].role !== 'user') {
        messages.unshift(filler);
    }

    return messages;
}