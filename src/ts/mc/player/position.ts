/**
 * Position and location utilities
 * @module mc/player/position
 */
import type { Bot } from 'mineflayer';
import type { Vec3 } from 'vec3';

/**
 * Get the bot's current position
 */
export function getPosition(bot: Bot): Vec3 {
    return bot.entity.position;
}