/**
 * Common type definitions for Minecraft-related functionality
 * @module mc/types
 */
import type { IndexedData } from 'minecraft-data';
import type PrismarineItem from 'prismarine-item';

export type ItemName = string;
export type BlockName = string;

export interface CraftingRecipe {
    [ingredient: string]: number;
}

export interface LimitingResourceResult<T> {
    num: number;
    limitingResource: T | null;
}

// The correct type for prismarine-item factory function
export type PrismarineItemFactory = ReturnType<typeof PrismarineItem>;

export interface McDataContext {
    mcData: IndexedData;
    Item: PrismarineItemFactory;
}
