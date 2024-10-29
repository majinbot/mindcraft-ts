/**
 * @file Shared TypeScript types for Minecraft bot modules
 * @description Common type definitions and interfaces used across skills modules
 */

import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import type { Block } from 'prismarine-block';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';

/**
 * Extended Bot type with all custom capabilities
 */
export interface ExtendedBot extends Bot {
    // Base properties
    output: string;
    interrupt_code?: boolean;

    // Inventory and item handling
    inventory: Bot['inventory'] & {
        slots: Array<Item | null>;
    };

    // Mode management
    modes: {
        isOn(mode: string): boolean;
        pause(mode: string): void;
        unpause(mode: string): void;
    };

    // Tool management
    tool: {
        equipForBlock(block: Block): Promise<void>;
    };

    // Block collection
    collectBlock: {
        collect(block: Block): Promise<void>;
    };

    // World interaction
    blockAt(pos: Vec3): Block | null;
}

/**
 * Extended Item interface with attack damage property
 */
export interface ExtendedItem extends Item {
    attackDamage: number;
}

/**
 * Configuration for movement operations
 */
export interface MovementConfig {
    canDig?: boolean;
    canPlaceOn?: boolean;
    allow1by1towers?: boolean;
    safeToBreak?(block: Block): boolean;
    dontMineUnderFallingBlock?: boolean;
}

/**
 * Valid placement sides for blocks
 */
export type PlacementSide = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west' | 'side';

/**
 * Direction vectors for block placement
 */
export const DIRECTION_VECTORS = {
    top: new Vec3(0, 1, 0),
    bottom: new Vec3(0, -1, 0),
    north: new Vec3(0, 0, -1),
    south: new Vec3(0, 0, 1),
    east: new Vec3(1, 0, 0),
    west: new Vec3(-1, 0, 0)
} as const;

/**
 * Blocks that don't require moving away from when placing
 */
export const STATIONARY_PLACEMENT_BLOCKS = new Set([
    'torch',
    'redstone_torch',
    'redstone_wire',
    'lever',
    'button',
    'rail',
    'detector_rail',
    'powered_rail',
    'activator_rail',
    'tripwire_hook',
    'tripwire',
    'water_bucket'
]);

/**
 * Empty block types that can be replaced
 */
export const REPLACEABLE_BLOCKS = new Set([
    'air',
    'water',
    'lava',
    'grass',
    'short_grass',
    'tall_grass',
    'snow',
    'dead_bush',
    'fern'
]);

/**
 * List of blocks that don't need to be broken
 * @internal
 */
export const UNBREAKABLE_BLOCKS = new Set(['air', 'water', 'lava']);

/**
 * Block types that have corresponding ore variants
 */
export const ORE_BLOCKS = new Set([
    'coal',
    'diamond',
    'emerald',
    'iron',
    'gold',
    'lapis_lazuli',
    'redstone'
]);

/**
 * Interface for block position references
 */
export interface BlockPosition {
    position: {
        x: number;
        y: number;
        z: number;
    };
}

/**
 * Block states for special blocks
 */
export interface BlockState {
    facing?: string;
    half?: string;
    face?: string;
    part?: string;
}

/**
 * Error types for block operations
 */
export interface BlockOperationError extends Error {
    name: string;
    code?: string;
}

/**
 * Resource calculation result
 */
export interface ResourceCalculation {
    num: number;
    limitingResource: string | null;
}

/**
 * Search options for finding blocks
 */
export interface BlockSearchOptions {
    matching: number[] | ((block: Block) => boolean);
    maxDistance: number;
    count: number;
}

/**
 * Options for free space search
 */
export interface FreeSpaceOptions {
    size?: number;
    distance?: number;
}

/**
 * Options for entity searches
 */
export interface EntitySearchOptions {
    maxDistance?: number;
    predicate?(entity: Entity): boolean;
}

/**
 * Common block categories
 */
export const EMPTY_BLOCKS = [
    'air',
    'water',
    'lava',
    'grass',
    'short_grass',
    'tall_grass',
    'snow',
    'dead_bush',
    'fern'
] as const;

/**
 * Common tool types
 */
export const TOOL_TYPES = [
    'sword',
    'axe',
    'pickaxe',
    'shovel',
    'hoe'
] as const;

/**
 * Type guard for checking if a block has drops
 */
export function hasDrops(block: Block): block is Block & { drops: number[] } {
    return 'drops' in block && Array.isArray((block as any).drops);
}

/**
 * Type guard for checking if an error is a block operation error
 */
export function isBlockOperationError(error: Error): error is BlockOperationError {
    return 'code' in error || error.name === 'NoChests';
}