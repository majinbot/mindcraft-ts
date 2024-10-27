/**
 * Block-related utilities for Minecraft bot
 * @module mc/blocks
 */
import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Vec3 } from 'vec3';
import type { McDataContext, BlockName, ItemName } from '../types';

export interface BlockLocation {
    block: Block;
    distance: number;
}

// Block information functions
/**
 * Gets the ID for a given block name
 */
export function getBlockId(ctx: McDataContext, blockName: BlockName): number | null {
    return ctx.mcData.blocksByName[blockName]?.id ?? null;
}

/**
 * Gets the name for a given block ID
 */
export function getBlockName(ctx: McDataContext, blockId: number): BlockName | null {
    return ctx.mcData.blocks[blockId]?.name ?? null;
}

/**
 * Gets all available blocks, optionally excluding specific ones
 */
export function getAllBlocks(ctx: McDataContext, ignore: string[] = []): typeof ctx.mcData.blocks[number][] {
    return Object.values(ctx.mcData.blocks)
        .filter(block => !ignore.includes(block.name));
}

/**
 * Gets all block IDs, optionally excluding specific ones
 */
export function getAllBlockIds(ctx: McDataContext, ignore: string[] = []): number[] {
    return getAllBlocks(ctx, ignore).map(block => block.id);
}

/**
 * Gets all available biomes
 */
export function getAllBiomes(ctx: McDataContext) {
    return ctx.mcData.biomes;
}

/**
 * Gets the required tool type for harvesting a block
 */
export function getBlockTool(ctx: McDataContext, blockName: BlockName): ItemName | null {
    const block = ctx.mcData.blocksByName[blockName];
    if (!block?.harvestTools) return null;

    const toolId = Object.keys(block.harvestTools)[0];
    return ctx.mcData.items[parseInt(toolId)]?.name ?? null;
}

/**
 * Gets all blocks that can drop a specific item
 */
export function getItemBlockSources(ctx: McDataContext, itemName: ItemName): BlockName[] {
    const itemId = ctx.mcData.itemsByName[itemName]?.id;
    if (!itemId) return [];

    return getAllBlocks(ctx)
        .filter(block => block.drops.includes(itemId))
        .map(block => block.name);
}

/**
 * Get a list of the nearest blocks of the given types
 */
export function getNearestBlocks(
    bot: Bot,
    ctx: McDataContext,
    blockTypes: string[] | string | null = null,
    distance = 16,
    count = 10000
): Block[] {
    let blockIds: number[];

    if (blockTypes === null) {
        blockIds = ctx.mcData.blocksByName['air'] ?
            Object.values(ctx.mcData.blocks)
                .filter(b => b.name !== 'air')
                .map(b => b.id) :
            [];
    } else {
        blockIds = (Array.isArray(blockTypes) ? blockTypes : [blockTypes])
            .map(type => ctx.mcData.blocksByName[type]?.id)
            .filter((id): id is number => id !== undefined);
    }

    const positions = bot.findBlocks({
        matching: blockIds,
        maxDistance: distance,
        count: count
    });

    const blocks: BlockLocation[] = positions
        .map(pos => ({
            block: bot.blockAt(pos)!,
            distance: pos.distanceTo(bot.entity.position)
        }))
        .filter((b): b is BlockLocation => b.block !== null)
        .sort((a, b) => a.distance - b.distance);

    return blocks.map(b => b.block);
}

/**
 * Get the nearest block of the given type
 */
export function getNearestBlock(
    bot: Bot,
    ctx: McDataContext,
    blockType: string,
    distance = 16
): Block | null {
    const blocks = getNearestBlocks(bot, ctx, blockType, distance, 1);
    return blocks[0] ?? null;
}

/**
 * Checks if a block is solid and can drop items
 */
function isValidGroundBlock(block: Block): boolean {
    return Boolean(block.diggable && Array.isArray(block.drops) && block.drops.length > 0);
}

/**
 * Get the nearest empty space with solid blocks beneath it of the given size
 */
export function getNearestFreeSpace(bot: Bot, size = 1, distance = 8): Vec3 | null {
    const emptyPositions = bot.findBlocks({
        matching: (block) => block?.name === 'air',
        maxDistance: distance,
        count: 1000
    });

    for (const pos of emptyPositions) {
        let empty = true;

        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                const top = bot.blockAt(pos.offset(x, 0, z));
                const bottom = bot.blockAt(pos.offset(x, -1, z));

                if (!top ||
                    !bottom ||
                    top.name !== 'air' ||
                    !isValidGroundBlock(bottom)) {
                    empty = false;
                    break;
                }
            }
            if (!empty) break;
        }

        if (empty) return pos;
    }

    return null;
}

/**
 * Get a list of all nearby block types
 */
export function getNearbyBlockTypes(bot: Bot, ctx: McDataContext, distance = 16): string[] {
    return [...new Set(
        getNearestBlocks(bot, ctx, null, distance)
            .map(block => block.name)
    )];
}