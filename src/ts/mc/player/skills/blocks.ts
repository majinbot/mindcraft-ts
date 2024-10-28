import type { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';
import type { McDataContext } from '../../types';
import { log, type ExtendedBot } from '../bot';
import { getNearestBlock } from '../../world/blocks';
import { goals, Movements } from 'mineflayer-pathfinder';

/**
 * Makes the bot break a specific block
 */
export async function breakBlock(
    bot: ExtendedBot, 
    block: Block,
    requireTool = true
): Promise<boolean> {
    if (!block || !block.diggable) return false;

    try {
        // Check if we can break this block
        if (requireTool && !bot.canDigBlock(block)) {
            log(bot, `Cannot break ${block.name} - missing required tool`);
            return false;
        }

        // Start digging
        log(bot, `Breaking ${block.name}`, true);
        await bot.dig(block);
        return true;
    } catch (err) {
        log(bot, `Failed to break block: ${(err as Error).message}`);
        return false;
    }
}

/**
 * Makes the bot collect nearby blocks of a specific type
 */
export async function collectBlocks(
    bot: ExtendedBot,
    ctx: McDataContext, 
    blockType: string,
    count = 1
): Promise<number> {
    let collected = 0;
    
    while (collected < count) {
        const block = getNearestBlock(bot, ctx, blockType);
        if (!block) break;

        const success = await breakBlock(bot, block);
        if (success) collected++;
    }

    return collected;
}

/**
 * Makes the bot place a block at a location
 */
export async function placeBlock(
    bot: ExtendedBot,
    position: Vec3,
    blockName: string
): Promise<boolean> {
    try {
        // Find block in inventory
        const item = bot.inventory.items().find(item => item.name === blockName);
        if (!item) {
            log(bot, `No ${blockName} in inventory`);
            return false;
        }

        // Get reference block and face
        const referenceBlock = bot.blockAt(position);
        if (!referenceBlock) return false;

        // Equip block and place it
        await bot.equip(item, 'hand');
        await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
        
        log(bot, `Placed ${blockName}`, true);
        return true;
    } catch (err) {
        log(bot, `Failed to place block: ${(err as Error).message}`);
        return false;
    }
}

/**
 * Makes the bot activate the nearest block of a given type
 */
export async function activateNearestBlock(
    bot: ExtendedBot,
    blockType: string,
    maxDistance = 16
): Promise<boolean> {
    const block = bot.findBlock({
        matching: (block) => block.name === blockType,
        maxDistance
    });

    if (!block) {
        log(bot, `Could not find any ${blockType} to activate`);
        return false;
    }

    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        bot.pathfinder.setMovements(new Movements(bot));
        await bot.pathfinder.goto(new goals.GoalNear(
            block.position.x,
            block.position.y, 
            block.position.z,
            4
        ));
    }

    await bot.activateBlock(block);
    log(bot, `Activated ${blockType} at ${block.position.x}, ${block.position.y}, ${block.position.z}`);
    return true;
}