import {
    ExtendedBot,
} from "../../../types/mc";

export * from "./blocks";
export * from "./combat";
export * from "./crafting";
export * from "./farming";
export * from "./items";
export * from "./navigation";
export * from "./smelting";
export * from "./torch";

/**
 * Logs a message to the bot's output and optionally sends it to game chat
 *
 * @param bot - The Minecraft bot instance
 * @param message - The message to log
 * @param chat - Whether to also send the message to game chat (default: false)
 *
 * @example
 * ```typescript
 * log(bot, "Found diamond!", true); // Logs to output and game chat
 * log(bot, "Debug info"); // Only logs to output
 * ```
 */
export function log(bot: ExtendedBot, message: string, chat: boolean = false): void {
    // Ensure message ends with newline for consistent formatting
    const formattedMessage = message.endsWith('\n') ? message : `${message}\n`;
    bot.output += formattedMessage;

    if (chat) {
        bot.chat(message);
    }
}

