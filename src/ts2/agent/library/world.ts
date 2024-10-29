/**
 * @file World interaction utilities for Minecraft bot agents
 * @description Provides high-level abstractions for interacting with the Minecraft world,
 * including block finding, entity detection, inventory management, and spatial queries.
 */

import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { Vec3 } from 'vec3';
import { Movements, goals } from 'mineflayer-pathfinder';
import {getAllBiomes, getAllBlockIds, getBlockId} from "../../utils/mcdata";

// Extend Bot type to include custom properties
interface ExtendedBot extends Bot {
    modes?: {
        isOn(mode: string): boolean;
    };
}

/**
 * Configuration for free space search
 */
interface FreeSpaceOptions {
    size?: number;
    distance?: number;
}

/**
 * Configuration for block search
 */
interface BlockSearchOptions {
    distance?: number;
    count?: number;
}

/**
 * Block with additional distance information
 */
interface BlockWithDistance {
    block: Block;
    distance: number;
}

/**
 * Entity with additional distance information
 */
interface EntityWithDistance {
    entity: Entity;
    distance: number;
}

/**
 * Extended Block type to ensure drops property exists
 */
interface ExtendedBlock extends Block {
    drops: number[];
}

/**
 * Type guard to check if a block has the drops property
 */
function hasDrops(block: Block): block is ExtendedBlock {
    return 'drops' in block && Array.isArray((block as ExtendedBlock).drops);
}

/**
 * Finds the nearest empty space with solid blocks beneath it
 * @param bot - The bot instance to search from
 * @param options - Configuration options for the search
 * @returns The position vector of the nearest suitable space, or null if none found
 */
export function getNearestFreeSpace(
    bot: Bot,
    { size = 1, distance = 8 }: FreeSpaceOptions = {},
): Vec3 | null {
    const emptyPositions = bot.findBlocks({
        matching: (block: Block) => block?.name === 'air',
        maxDistance: distance,
        count: 1000,
    });

    for (const pos of emptyPositions) {
        let isEmpty = true;

        // Check each block in the size x size area
        for (let x = 0; x < size && isEmpty; x++) {
            for (let z = 0; z < size && isEmpty; z++) {
                const topBlock = bot.blockAt(pos.offset(x, 0, z));
                const bottomBlock = bot.blockAt(pos.offset(x, -1, z));

                // Validate space requirements
                if (!topBlock ||
                    topBlock.name !== 'air' ||
                    !bottomBlock ||
                    !hasDrops(bottomBlock) ||
                    bottomBlock.drops.length === 0 ||
                    !bottomBlock.diggable) {
                    isEmpty = false;
                }
            }
        }

        if (isEmpty) {
            return pos;
        }
    }

    return null;
}

/**
 * Finds the nearest blocks matching the given criteria
 * @param bot - The bot instance to search from
 * @param blockTypes - Array of block names to search for, or null for all blocks
 * @param options - Configuration options for the search
 * @returns Array of matching blocks sorted by distance
 */
export function getNearestBlocks(
    bot: Bot,
    blockTypes: string[] | string | null = null,
    { distance = 16, count = 10000 }: BlockSearchOptions = {},
): Block[] {
    // Convert blockTypes to array if it's a string
    const blockTypeArray = blockTypes === null
        ? null
        : (Array.isArray(blockTypes) ? blockTypes : [blockTypes]);

    // Get block IDs to search for
    const blockIds = blockTypeArray === null
        ? getAllBlockIds(['air'])
        : blockTypeArray.map(getBlockId).filter((id): id is number => id !== null);

    // Find matching block positions
    const positions = bot.findBlocks({
        matching: blockIds,
        maxDistance: distance,
        count,
    });

    // Convert positions to blocks with distances
    const blocksWithDistance: BlockWithDistance[] = positions
        .map(pos => {
            const block = bot.blockAt(pos);
            if (!block) return null;
            return {
                block,
                distance: pos.distanceTo(bot.entity.position),
            };
        })
        .filter((block): block is BlockWithDistance => block !== null)
        .sort((a, b) => a.distance - b.distance);

    return blocksWithDistance.map(b => b.block);
}

/**
 * Finds the nearest block of a given type
 * @param bot - The bot instance to search from
 * @param blockType - The type of block to search for
 * @param distance - Maximum search distance
 * @returns The nearest matching block or null if none found
 */
export function getNearestBlock(
    bot: Bot,
    blockType: string,
    distance = 16,
): Block | null {
    const blocks = getNearestBlocks(bot, blockType, { distance, count: 1 });
    return blocks[0] ?? null;
}

/**
 * Gets all nearby entities within a given radius
 * @param bot - The bot instance to search from
 * @param maxDistance - Maximum search radius
 * @returns Array of nearby entities sorted by distance
 */
export function getNearbyEntities(bot: Bot, maxDistance = 16): Entity[] {
    const entitiesWithDistance: EntityWithDistance[] = Object.values(bot.entities)
        .map(entity => ({
            entity,
            distance: entity.position.distanceTo(bot.entity.position),
        }))
        .filter(e => e.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);

    return entitiesWithDistance.map(e => e.entity);
}

/**
 * Finds the nearest entity matching a predicate
 * @param bot - The bot instance to search from
 * @param predicate - Function to test each entity
 * @param maxDistance - Maximum search radius
 * @returns The nearest matching entity or null
 */
export function getNearestEntityWhere(
    bot: Bot,
    predicate: (entity: Entity) => boolean,
    maxDistance = 16,
): Entity | null {
    return bot.nearestEntity(entity =>
        predicate(entity) &&
        bot.entity.position.distanceTo(entity.position) < maxDistance
    );
}

/**
 * Gets all nearby players within a given radius
 * @param bot - The bot instance to search from
 * @param maxDistance - Maximum search radius
 * @returns Array of nearby player entities sorted by distance
 */
export function getNearbyPlayers(bot: Bot, maxDistance = 16): Entity[] {
    return getNearbyEntities(bot, maxDistance)
        .filter(entity =>
            entity.type === 'player' &&
            entity.username !== bot.username
        );
}

/**
 * Gets all item stacks in the bot's inventory
 * @param bot - The bot instance to check
 * @returns Array of inventory items
 */
export function getInventoryStacks(bot: Bot): Item[] {
    return bot.inventory.items();
}

/**
 * Gets count of each item type in the bot's inventory
 * @param bot - The bot instance to check
 * @returns Object mapping item names to quantities
 */
export function getInventoryCounts(bot: Bot): Record<string, number> {
    const inventory: Record<string, number> = {};

    for (const item of bot.inventory.items()) {
        inventory[item.name] = (inventory[item.name] || 0) + item.count;
    }

    return inventory;
}

/**
 * Gets the bot's current position
 * @param bot - The bot instance to check
 * @returns Position vector
 */
export function getPosition(bot: Bot): Vec3 {
    return bot.entity.position;
}

/**
 * Gets types of all nearby entities
 * @param bot - The bot instance to check
 * @returns Array of unique entity type names
 */
export function getNearbyEntityTypes(bot: Bot): string[] {
    return [...new Set(
        getNearbyEntities(bot, 16)
            .map(entity => entity.name)
            .filter((name): name is string => name !== undefined)
    )];
}

/**
 * Gets usernames of all nearby players
 * @param bot - The bot instance to check
 * @returns Array of player usernames
 */
export function getNearbyPlayerNames(bot: Bot): string[] {
    return [...new Set(
        getNearbyPlayers(bot, 16)
            .map(player => player.username)
            .filter((name): name is string =>
                name !== undefined &&
                name !== bot.username
            )
    )];
}

/**
 * Gets types of all nearby blocks
 * @param bot - The bot instance to check
 * @param distance - Maximum search radius
 * @returns Array of unique block type names
 */
export function getNearbyBlockTypes(bot: Bot, distance = 16): string[] {
    return [...new Set(
        getNearestBlocks(bot, null, { distance })
            .map(block => block.name)
    )];
}

/**
 * Checks if there is a clear path to a target
 * @param bot - The bot instance to check
 * @param target - The target entity or position
 * @returns Promise resolving to true if path exists
 */
export async function isClearPath(bot: Bot, target: Entity): Promise<boolean> {
    const movements = new Movements(bot);
    // Use index signature to set properties that might not be in type definition
    (movements as any).canDig = false;
    (movements as any).canPlaceOn = false;

    const goal = new goals.GoalNear(
        target.position.x,
        target.position.y,
        target.position.z,
        1
    );

    try {
        const path = bot.pathfinder.getPathTo(movements, goal, 100);
        return path.status === 'success';
    } catch (error) {
        return false;
    }
}

/**
 * Checks if a torch should be placed at the current position
 * @param bot - The bot instance to check
 * @returns True if torch placement is recommended
 */
export function shouldPlaceTorch(bot: ExtendedBot): boolean {
    if (!bot.modes?.isOn('torch_placing')) return false;

    const pos = getPosition(bot);
    const nearestTorch = getNearestBlock(bot, 'torch', 6) ||
        getNearestBlock(bot, 'wall_torch', 6);

    if (!nearestTorch) {
        const block = bot.blockAt(pos);
        const hasTorch = bot.inventory.items().some(item => item.name === 'torch');
        return Boolean(hasTorch && block?.name === 'air');
    }

    return false;
}

/**
 * Gets the name of the current biome
 * @param bot - The bot instance to check
 * @returns Biome name string
 */
export function getBiomeName(bot: Bot): string {
    const biomeId = bot.world.getBiome(bot.entity.position);
    return getAllBiomes()[biomeId].name;
}