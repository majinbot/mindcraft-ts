/**
 * Bot creation and management functionality
 * @module mc/player/bot
 */
import { createBot } from 'mineflayer';
import { goals, pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { loader as autoEat } from 'mineflayer-auto-eat';
import armorManager from 'mineflayer-armor-manager';
import type { Bot as MineflayerBot } from 'mineflayer';


/**
 * Extended Bot interface with additional properties
 */
export interface ExtendedBot extends MineflayerBot {
    output: string;
}

// Type assertion function to treat a MineflayerBot as ExtendedBot
export function asExtendedBot(bot: MineflayerBot): ExtendedBot {
    (bot as ExtendedBot).output = '';
    return bot as ExtendedBot;
}

/**
 * Creates and initializes a new Minecraft bot with standard plugins
 * @param {object} params - Bot initialization parameters
 * @param {string} params.username - Bot's username
 * @param {string} params.host - Server host address
 * @param {number} params.port - Server port
 * @param {string} params.version - Minecraft version
 * @param {'offline' | 'microsoft'} params.auth - Authentication type
 * @returns {Bot} Configured bot instance
 */
export function initBot({
                            username,
                            host,
                            port,
                            version,
                            auth
                        }: {
    username: string;
    host: string;
    port: number;
    version: string;
    auth: 'offline' | 'microsoft';
}): ExtendedBot {
    const _bot = createBot({
        username,
        host,
        port,
        version,
        auth
    });

    // Convert to extended bot with output property
    const bot = asExtendedBot(_bot);

    // Load standard plugins
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectblock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(armorManager);

    return bot;
}

/**
 * Makes the bot sleep in the nearest bed
 */
export async function sleep(bot: ExtendedBot): Promise<boolean> {
    const bed = bot.findBlock({
        matching: block => block.name.includes('bed'),
        maxDistance: 16
    });

    if (!bed) {
        log(bot, 'Could not find a bed to sleep in');
        return false;
    }

    await bot.pathfinder.goto(new goals.GoalBlock(
        bed.position.x,
        bed.position.y,
        bed.position.z
    ));

    try {
        await bot.sleep(bed);
        log(bot, 'You are in bed');

        // Wait until no longer sleeping
        while (bot.isSleeping) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        log(bot, 'You have woken up');
        return true;
    } catch (err) {
        log(bot, `Failed to sleep: ${(err as Error).message}`);
        return false;
    }
}

/**
 * Log a message to the bot's output and optionally to chat
 */
export function log(bot: ExtendedBot, message: string, chat = false): void {
    bot.output += message + '\n';
    if (chat) {
        bot.chat(message);
    }
}