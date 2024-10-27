/**
 * Common type definitions for Minecraft-related functionality
 * @module mc/types
 */
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Item } from 'prismarine-item';
import type { Recipe } from 'prismarine-recipe';
import type { IndexedData } from 'minecraft-data';
import type PrismarineItem from 'prismarine-item';

export type { Bot, Entity, Item, Recipe, IndexedData };

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
