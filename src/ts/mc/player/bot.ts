/**
 * Bot creation and management functionality
 * @module mc/player/bot
 */
import { createBot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { loader as autoEat } from 'mineflayer-auto-eat';
import armorManager from 'mineflayer-armor-manager';
import type { Bot } from '../types';
import {Entity} from "prismarine-entity";

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
}): Bot {
    const bot = createBot({
        username,
        host,
        port,
        version,
        auth
    });

    // Load standard plugins
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectblock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(armorManager);

    return bot;
}

/**
 * Checks if an entity is a huntable animal
 * @param {Entity | null} mob - Entity to check
 * @returns {boolean} True if entity is a huntable animal
 */
export function isHuntable(mob: Entity | null): boolean {
    if (!mob?.name) return false;
    const animals = ['chicken', 'cow', 'llama', 'mooshroom', 'pig', 'rabbit', 'sheep'];
    return animals.includes(mob.name.toLowerCase()) && !mob.metadata[16]; // metadata 16 is not baby
}

/**
 * Checks if an entity is hostile
 * @param {Entity | null} mob - Entity to check
 * @returns {boolean} True if entity is hostile
 */
export function isHostile(mob: Entity | null): boolean {
    if (!mob?.name) return false;
    return (
        (mob.type === 'mob' || mob.type === 'hostile') &&
        mob.name !== 'iron_golem' &&
        mob.name !== 'snow_golem'
    );
}