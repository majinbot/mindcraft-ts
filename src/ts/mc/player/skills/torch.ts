import { Bot, FindBlockOptions } from "mineflayer";
import type { ExtendedBot } from '../bot';
import { placeBlock } from './blocks';

/**
 * Check if a torch should be placed at the current location
 */
export function shouldPlaceTorch(bot: Bot): boolean {
    const block = bot.blockAt(bot.entity.position);
    if (!block) return false;

    const blockOptions: FindBlockOptions = {
        matching: (block) =>
            block.name === 'torch' || block.name === 'wall_torch',
        maxDistance: 6,
        count: 1
    };

    const hasTorchNearby = bot.findBlocks(blockOptions).length > 0;

    if (!hasTorchNearby) {
        const hasTorch = bot.inventory.items().some(item => item.name === 'torch');
        return Boolean(hasTorch && block.name === 'air');
    }

    return false;
}

/**
 * Makes the bot automatically place torches when needed
 */
export async function autoLight(bot: ExtendedBot): Promise<boolean> {
    if (shouldPlaceTorch(bot)) {
        try {
            const pos = bot.entity.position;
            return await placeBlock(bot, pos, 'torch');
        } catch (err) {
            return false;
        }
    }
    return false;
}
