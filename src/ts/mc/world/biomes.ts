/**
 * Biome-related utilities
 * @module mc/world/biomes
 */
import type { Bot } from 'mineflayer';
import type { McDataContext } from '../types';

/**
 * Get the name of the biome the bot is currently in
 */
export function getBiomeName(bot: Bot, ctx: McDataContext): string {
    const biomeId = bot.world.getBiome(bot.entity.position);
    return ctx.mcData.biomes[biomeId].name;
}