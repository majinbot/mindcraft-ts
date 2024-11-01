/**
 * @file Shared TypeScript types for Minecraft bot modules
 * @description Common type definitions and interfaces used across skills modules
 */

import { Vec3 } from 'vec3';
import type { Item } from 'prismarine-item';

/**
 * Extended Item interface with attack damage property
 */
export interface ExtendedItem extends Item {
    attackDamage: number;
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
