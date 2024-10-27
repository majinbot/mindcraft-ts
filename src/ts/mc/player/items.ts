/**
 * Item-related utility functions
 * @module mc/player/items
 */
import type { McDataContext, ItemName } from '../types';
import { MISC_SMELTABLES, FUEL_BURN_TIME, type FuelType } from '../constants';
import type { Bot, Item } from '../types';

/**
 * Gets the ID for a given item name
 */
export function getItemId(ctx: McDataContext, itemName: ItemName): number | null {
    return ctx.mcData.itemsByName[itemName]?.id ?? null;
}

/**
 * Gets the name for a given item ID
 */
export function getItemName(ctx: McDataContext, itemId: number): ItemName | null {
    return ctx.mcData.items[itemId]?.name ?? null;
}

/**
 * Gets all available items, optionally excluding specific ones
 */
export function getAllItems(ctx: McDataContext, ignore: string[] = []): typeof ctx.mcData.items[number][] {
    return Object.values(ctx.mcData.items)
        .filter(item => !ignore.includes(item.name));
}

/**
 * Gets all item IDs, optionally excluding specific ones
 */
export function getAllItemIds(ctx: McDataContext, ignore: string[] = []): number[] {
    return getAllItems(ctx, ignore).map(item => item.id);
}

/**
 * Checks if an item can be smelted
 */
export function isSmeltable(itemName: ItemName): boolean {
    return (
        itemName.includes('raw_') ||
        itemName.includes('log') ||
        MISC_SMELTABLES.includes(itemName as any)
    );
}

/**
 * Gets available smelting fuel from bot's inventory
 */
export function getSmeltingFuel(bot: Bot): Item | null {
    // Try to find best fuel first
    for (const fuelName of ['coal', 'charcoal', 'coal_block', 'lava_bucket'] as const) {
        const fuel = bot.inventory.items().find(i => i.name === fuelName);
        if (fuel) return fuel;
    }

    // Fall back to wood items
    return bot.inventory.items().find(i =>
        i.name.includes('log') || i.name.includes('planks')
    ) ?? null;
}

/**
 * Gets the number of items a fuel type can smelt
 */
export function getFuelSmeltOutput(fuelName: string): number {
    if (fuelName in FUEL_BURN_TIME) {
        return FUEL_BURN_TIME[fuelName as FuelType];
    }
    if (fuelName.includes('log') || fuelName.includes('planks')) {
        return FUEL_BURN_TIME.log;
    }
    return 0;
}

/**
 * Creates a new item instance
 */
export function makeItem(ctx: McDataContext, name: ItemName, amount = 1): Item {
    const itemId = getItemId(ctx, name);
    if (itemId === null) {
        throw new Error(`Invalid item name: ${name}`);
    }
    return new ctx.Item(itemId, amount);
}