/**
 * Inventory management utilities
 * @module mc/player/inventory
 */
import type { Bot } from 'mineflayer';
import type { Item } from 'prismarine-item';

export type InventoryCounts = Record<string, number>;

/**
 * Get all item stacks in the bot's inventory
 */
export function getInventoryStacks(bot: Bot): Item[] {
    return bot.inventory.items().filter((item): item is Item => item != null);
}

/**
 * Get counts of all items in the bot's inventory
 */
export function getInventoryCounts(bot: Bot): InventoryCounts {
    const inventory: InventoryCounts = {};

    for (const item of bot.inventory.items()) {
        if (item) {
            inventory[item.name] = (inventory[item.name] || 0) + item.count;
        }
    }

    return inventory;
}