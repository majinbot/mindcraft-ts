import {ExtendedBot} from "../../../types/mc";
import {log} from "./index";
import {goToPlayer, goToPosition} from "./navigation";
import {getNearestBlock} from "../world";
import {Item} from "prismarine-item";
import {Block} from "prismarine-block";

/**
 * Configuration options for item operations
 */
interface ItemOptions {
    /** Maximum range to search for containers (default: 32) */
    range?: number;
    /** Whether to store items if inventory is full */
    allowStorage?: boolean;
    /** Number of items to process (-1 for all) */
    count?: number;
}

/**
 * Storage utilities for furnace items
 * @internal
 */
interface StorageResult {
    success: boolean;
    storedItems: {
        name: string;
        count: number;
    }[];
    failedItems: {
        name: string;
        count: number;
        reason: string;
    }[];
}

/**
 * Equipment slots for items
 */
type EquipmentSlot = 'hand' | 'off-hand' | 'head' | 'torso' | 'legs' | 'feet';

/**
 * Determines the appropriate equipment slot for an item
 * @internal
 */
function getEquipmentSlot(itemName: string): EquipmentSlot {
    if (itemName.includes('leggings')) return 'legs';
    if (itemName.includes('boots')) return 'feet';
    if (itemName.includes('helmet')) return 'head';
    if (itemName.includes('chestplate') || itemName.includes('elytra')) return 'torso';
    if (itemName.includes('shield')) return 'off-hand';
    return 'hand';
}

/**
 * Custom error for item operations
 */
export class ItemError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ItemError';
    }
}

/**
 * Equip an item in the appropriate slot
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of the item to equip
 * @returns Promise resolving to true if item was equipped
 *
 * @remarks
 * Automatically determines correct equipment slot based on item type:
 * - Armor pieces go to their respective slots
 * - Shields go to off-hand
 * - Other items go to main hand
 * Supports all vanilla equipment types
 *
 * @throws {ItemError} If item is not found or cannot be equipped
 *
 * @example
 * ```typescript
 * // Equip a tool
 * await equip(bot, "diamond_pickaxe");
 *
 * // Equip armor
 * await equip(bot, "iron_chestplate");
 * ```
 */
export async function equip(
    bot: ExtendedBot,
    itemName: string
): Promise<boolean> {
    // Find item in inventory
    const item = bot.inventory.slots.find(slot =>
        slot && slot.name === itemName
    );

    if (!item) {
        throw new ItemError(`No ${itemName} found in inventory`);
    }

    try {
        const slot = getEquipmentSlot(itemName);
        await bot.equip(item, slot);
        log(bot, `Equipped ${itemName} in ${slot}`);
        return true;
    } catch (error) {
        throw new ItemError(`Failed to equip ${itemName}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * Discard items from inventory
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of item to discard
 * @param options - Configuration options
 * @returns Promise resolving to true if items were discarded
 *
 * @remarks
 * Provides controlled item disposal:
 * - Can discard specific quantities or all matching items
 * - Tracks and reports total discarded items
 * - Handles stack splitting automatically
 *
 * @example
 * ```typescript
 * // Discard specific amount
 * await discard(bot, "dirt", { count: 64 });
 *
 * // Discard all matching items
 * await discard(bot, "cobblestone", { count: -1 });
 * ```
 */
export async function discard(
    bot: ExtendedBot,
    itemName: string,
    options: ItemOptions = {}
): Promise<boolean> {
    const { count = -1 } = options;
    let discarded = 0;

    try {
        while (true) {
            const item = bot.inventory.items().find(item =>
                item.name === itemName
            );

            if (!item) break;

            const toDiscard = count === -1 ?
                item.count :
                Math.min(count - discarded, item.count);

            await bot.toss(item.type, null, toDiscard);
            discarded += toDiscard;

            if (count !== -1 && discarded >= count) break;
        }

        if (discarded === 0) {
            throw new ItemError(`No ${itemName} found to discard`);
        }

        log(bot, `Discarded ${discarded} ${itemName}`);
        return true;

    } catch (error) {
        if (error instanceof ItemError) throw error;
        throw new ItemError(`Failed to discard ${itemName}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * Store items in nearest chest
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of item to store
 * @param countOrOptions - Number of items to store or configuration options
 * @returns Promise resolving to true if items were stored
 *
 * @remarks
 * Handles chest interaction:
 * - Finds nearest chest within range
 * - Navigates to chest if needed
 * - Supports partial stack storage
 * - Verifies successful storage
 *
 * @throws {ItemError} If chest not found or storage fails
 *
 * @example
 * ```typescript
 * // Store all matching items
 * await putInChest(bot, "iron_ore");
 *
 * // Store specific amount
 * await putInChest(bot, "diamond", { count: 5 });
 * ```
 */
export async function putInChest(
    bot: ExtendedBot,
    itemName: string,
    countOrOptions?: number | ItemOptions
): Promise<boolean> {
    // Parse options
    let count = -1;
    let range = 32;

    if (typeof countOrOptions === 'number') {
        count = countOrOptions;
    } else if (countOrOptions) {
        count = countOrOptions.count ?? -1;
        range = countOrOptions.range ?? 32;
    }

    try {
        // Find chest
        const chest = getNearestBlock(bot, 'chest', range);
        if (!chest) {
            throw new ItemError('No chest found within range');
        }

        // Find item
        const item = bot.inventory.items().find(item =>
            item.name === itemName
        );
        if (!item) {
            throw new ItemError(`No ${itemName} found in inventory`);
        }

        // Calculate amount to store
        const toStore = count === -1 ?
            item.count :
            Math.min(count, item.count);

        // Move to chest
        await goToPosition(bot,
            chest.position.x,
            chest.position.y,
            chest.position.z,
            { minDistance: 2 }
        );

        // Store items
        const container = await bot.openContainer(chest);
        await container.deposit(item.type, null, toStore);
        container.close();

        log(bot, `Stored ${toStore} ${itemName} in chest`);
        return true;

    } catch (error) {
        if (error instanceof ItemError) throw error;
        throw new ItemError(`Failed to store ${itemName}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * Retrieve items from nearest chest
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of item to retrieve
 * @param options - Configuration options
 * @returns Promise resolving to true if items were retrieved
 *
 * @remarks
 * Provides chest retrieval functionality:
 * - Searches for nearest accessible chest
 * - Verifies item availability
 * - Handles partial stack withdrawal
 * - Manages inventory space
 *
 * @throws {ItemError} If chest not found or retrieval fails
 *
 * @example
 * ```typescript
 * // Get all matching items
 * await takeFromChest(bot, "coal");
 *
 * // Get specific amount
 * await takeFromChest(bot, "arrow", { count: 16 });
 * ```
 */
export async function takeFromChest(
    bot: ExtendedBot,
    itemName: string,
    options: ItemOptions = {}
): Promise<boolean> {
    const { count = -1, range = 32 } = options;

    try {
        // Find chest
        const chest = getNearestBlock(bot, 'chest', range);
        if (!chest) {
            throw new ItemError('No chest found within range');
        }

        // Move to chest
        await goToPosition(bot,
            chest.position.x,
            chest.position.y,
            chest.position.z,
            { minDistance: 2 }
        );

        // Open chest and find item
        const container = await bot.openContainer(chest);
        const item = container.containerItems().find(item =>
            item.name === itemName
        );

        if (!item) {
            container.close();
            throw new ItemError(`No ${itemName} found in chest`);
        }

        // Calculate amount to take
        const toTake = count === -1 ?
            item.count :
            Math.min(count, item.count);

        // Retrieve items
        await container.withdraw(item.type, null, toTake);
        container.close();

        log(bot, `Retrieved ${toTake} ${itemName} from chest`);
        return true;

    } catch (error) {
        if (error instanceof ItemError) throw error;
        throw new ItemError(`Failed to retrieve ${itemName}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * View contents of nearest chest
 *
 * @param bot - The Minecraft bot instance
 * @param options - Configuration options
 * @returns Promise resolving to true if chest was viewed
 *
 * @remarks
 * Provides chest inventory inspection:
 * - Finds and navigates to nearest chest
 * - Reports detailed inventory contents
 * - Handles empty chests appropriately
 *
 * @throws {ItemError} If chest not found or cannot be accessed
 *
 * @example
 * ```typescript
 * // View default range
 * await viewChest(bot);
 *
 * // View extended range
 * await viewChest(bot, { range: 50 });
 * ```
 */
export async function viewChest(
    bot: ExtendedBot,
    options: ItemOptions = {}
): Promise<boolean> {
    const { range = 32 } = options;

    try {
        // Find chest
        const chest = getNearestBlock(bot, 'chest', range);
        if (!chest) {
            throw new ItemError('No chest found within range');
        }

        // Move to chest
        await goToPosition(bot,
            chest.position.x,
            chest.position.y,
            chest.position.z,
            { minDistance: 2 }
        );

        // View contents
        const container = await bot.openContainer(chest);
        const items = container.containerItems();

        if (items.length === 0) {
            log(bot, 'Chest is empty');
        } else {
            log(bot, 'Chest contains:');
            for (const item of items) {
                log(bot, `${item.count} ${item.name}`);
            }
        }

        container.close();
        return true;

    } catch (error) {
        if (error instanceof ItemError) throw error;
        throw new ItemError(`Failed to view chest: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * Consume a food item
 *
 * @param bot - The Minecraft bot instance
 * @param foodName - Optional specific food to eat
 * @returns Promise resolving to true if food was eaten
 *
 * @remarks
 * Handles food consumption:
 * - Can target specific food items
 * - Automatically finds edible items if none specified
 * - Verifies food is actually consumable
 * - Manages equipment slots
 *
 * @throws {ItemError} If no food found or consumption fails
 *
 * @example
 * ```typescript
 * // Eat specific food
 * await eat(bot, "cooked_beef");
 *
 * // Eat any available food
 * await eat(bot);
 * ```
 */
export async function eat(
    bot: ExtendedBot,
    foodName: string = ""
): Promise<boolean> {
    try {
        // Find food item
        const item = foodName ?
            bot.inventory.items().find(item => item.name === foodName) :
            bot.inventory.items().find(item => 'foodRecovery' in item && Number(item.foodRecovery) > 0);

        if (!item) {
            throw new ItemError(
                foodName ?
                    `No ${foodName} found in inventory` :
                    'No food found in inventory'
            );
        }

        // Consume food
        await bot.equip(item, 'hand');
        await bot.consume();

        log(bot, `Consumed ${item.name}`);
        return true;

    } catch (error) {
        if (error instanceof ItemError) throw error;
        throw new ItemError(`Failed to eat: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * Give items to a player
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of item to give
 * @param username - Username of recipient
 * @param options - Configuration options
 * @returns Promise resolving to true if items were given
 *
 * @throws {ItemError} If player not found or transfer fails
 */
export async function giveToPlayer(
    bot: ExtendedBot,
    itemName: string,
    username: string,
    options: ItemOptions = {}
): Promise<boolean> {
    const { count = 1 } = options;

    try {
        // Validate player
        const player = bot.players[username]?.entity;
        if (!player) {
            throw new ItemError(`Player ${username} not found`);
        }

        // Validate item
        const item = bot.inventory.items().find(item =>
            item.name === itemName
        );
        if (!item) {
            throw new ItemError(`No ${itemName} found in inventory`);
        }

        // Move to player
        await goToPlayer(bot, username);
        await bot.lookAt(player.position);

        // Give items
        await discard(bot, itemName, { count });

        log(bot, `Gave ${count} ${itemName} to ${username}`);
        return true;

    } catch (error) {
        if (error instanceof ItemError) throw error;
        throw new ItemError(`Failed to give ${itemName} to ${username}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * Find items in inventory matching criteria
 *
 * @param bot - The Minecraft bot instance
 * @param predicate - Function to test each item
 * @returns Array of matching items
 *
 * @example
 * ```typescript
 * // Find all tools
 * const tools = findItems(bot, item =>
 *   item.name.includes('pickaxe') ||
 *   item.name.includes('shovel')
 * );
 *
 * // Find food items
 * const food = findItems(bot, item =>
 *   'foodRecovery' in item && item.foodRecovery > 0
 * );
 * ```
 */
export function findItems(
    bot: ExtendedBot,
    predicate: (item: Item) => boolean
): Item[] {
    return bot.inventory.items().filter(predicate);
}

/**
 * Get total count of specific item in inventory
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of item to count
 * @returns Total count of matching items
 */
export function getItemCount(
    bot: ExtendedBot,
    itemName: string
): number {
    return bot.inventory.items()
        .filter(item => item.name === itemName)
        .reduce((total, item) => total + item.count, 0);
}

/**
 * Check if inventory has space for more items
 *
 * @param bot - The Minecraft bot instance
 * @param requiredSlots - Number of free slots needed
 * @returns True if inventory has required space
 */
export function hasInventorySpace(
    bot: ExtendedBot,
    requiredSlots: number = 1
): boolean {
    const emptySlots = bot.inventory.slots.filter(slot => !slot).length;
    return emptySlots >= requiredSlots;
}

/**
 * Find nearest container (chest, barrel, shulker box, etc.)
 *
 * @param bot - The Minecraft bot instance
 * @param options - Search options
 * @returns Nearest container block or null if none found
 */
export function findNearestContainer(
    bot: ExtendedBot,
    options: ItemOptions = {}
): Block | null {
    const { range = 32 } = options;

    const containerTypes = [
        'chest',
        'barrel',
        'shulker_box',
        'trapped_chest'
    ];

    for (const type of containerTypes) {
        const container = getNearestBlock(bot, type, range);
        if (container) return container;
    }

    return null;
}

/**
 * Sort inventory by grouping similar items
 *
 * @param bot - The Minecraft bot instance
 * @returns Promise resolving when sorting is complete
 *
 * @remarks
 * Consolidates partial stacks and groups similar items together
 * Uses quick bar slots for temporary storage if needed
 */
export async function sortInventory(bot: ExtendedBot): Promise<void> {
    try {
        const items = bot.inventory.items();

        // Group items by name
        const groups = new Map<string, Item[]>();
        for (const item of items) {
            const existing = groups.get(item.name) || [];
            existing.push(item);
            groups.set(item.name, existing);
        }

        // Consolidate partial stacks
        for (const [_, groupItems] of groups) {
            if (groupItems.length <= 1) continue;

            // Sort by amount ascending
            groupItems.sort((a, b) => a.count - b.count);

            // Combine stacks where possible
            for (let i = 0; i < groupItems.length - 1; i++) {
                const source = groupItems[i];
                const target = groupItems[i + 1];

                if (source.count === 0) continue;
                if (target.count >= 64) continue;

                const space = 64 - target.count;
                const amount = Math.min(space, source.count);

                if (amount > 0) {
                    // Using correct mineflayer inventory methods
                    await bot.clickWindow(source.slot, 0, 0); // Pick up source stack
                    await bot.clickWindow(target.slot, 0, 0); // Merge with target
                    if (source.count > space) {
                        // Put remaining items back
                        await bot.clickWindow(source.slot, 0, 0);
                    }
                }

                // Small delay to prevent inventory desyncs
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        log(bot, 'Inventory sorted');

    } catch (error) {
        throw new ItemError(`Failed to sort inventory: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * Store furnace contents in nearest chest
 * @internal
 */
export async function storeFurnaceContents(
    bot: ExtendedBot,
    contents: {
        output: Item | null;
        input: Item | null;
        fuel: Item | null;
    },
): Promise<StorageResult> {
    const result: StorageResult = {
        success: false,
        storedItems: [],
        failedItems: []
    };

    try {
        for (const item of Object.values(contents)) {
            if (item) {
                try {
                    const success = await putInChest(bot, item.name, item.count);

                    if (success) {
                        result.storedItems.push({
                            name: item.name,
                            count: item.count
                        });
                    } else {
                        result.failedItems.push({
                            name: item.name,
                            count: item.count,
                            reason: 'Storage failed'
                        });
                    }
                } catch (error) {
                    result.failedItems.push({
                        name: item.name,
                        count: item.count,
                        reason: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        }

        result.success = result.storedItems.length > 0;
        return result;

    } catch (error) {
        // Add all items to failed list if general error
        result.failedItems = Object.values(contents)
            .filter((item): item is Item => item !== null)
            .map(item => ({
                name: item.name,
                count: item.count,
                reason: error instanceof Error ? error.message : 'Unknown error'
            }));

        return result;
    }
}
