import {getFuelSmeltOutput, getItemId, getItemName, getSmeltingFuel, isSmeltable} from "../../../utils/mcdata";
import {Block} from "prismarine-block";
import {goToNearestBlock} from "./navigation";
import {getInventoryCounts, getNearestBlock, getNearestFreeSpace} from "../world";
import {getRecipeId} from "./crafting";
import {collectBlock, placeBlock} from "./blocks";
import {log} from "./index";
import {storeFurnaceContents} from "./items";
import {Bot} from "mineflayer";

/**
 * Configuration options for smelting operations
 */
interface SmeltingOptions {
    /** Whether to place a furnace if needed */
    placeFurnace?: boolean;
    /** Maximum range to search for furnace */
    range?: number;
    /** Whether to collect furnace after use */
    collectAfterUse?: boolean;
    /** Timeout for smelting operations in ms (default: 30 minutes) */
    timeout?: number;
    /** Check interval for smelting progress in ms (default: 10000) */
    checkInterval?: number;
}

/**
 * Custom error for crafting operations
 */
export class SmeltingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SmeltingError';
    }
}

/**
 * Configuration for furnace clearing operations
 */
interface FurnaceClearOptions {
    /** Maximum range to search for furnace */
    range?: number;
    /** Whether to store collected items in chest */
    storeItems?: boolean;
}

/**
 * Result of a furnace operation
 */
interface FurnaceResult {
    success: boolean;
    itemsProcessed: number;
    outputItem?: string;
    remainingFuel?: number;
}

/**
 * Smelt items in a furnace
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of item to smelt
 * @param num - Number of items to smelt (default: 1)
 * @param options - Configuration options for smelting
 * @returns Promise resolving to smelting result
 *
 * @remarks
 * Handles complete smelting process:
 * - Finds or places furnace
 * - Manages fuel
 * - Monitors progress
 * - Collects output
 * - Handles interruptions
 *
 * @throws {SmeltingError} If smelting fails or requirements not met
 *
 * @example
 * ```typescript
 * // Smelt iron ore
 * await smeltItem(bot, "raw_iron", 64, {
 *   placeFurnace: true,
 *   collectAfterUse: true
 * });
 * ```
 */
export async function smeltItem(
    bot: Bot,
    itemName: string,
    num: number = 1,
    options: SmeltingOptions = {}
): Promise<FurnaceResult> {
    const {
        placeFurnace = true,
        range = 32,
        collectAfterUse = true,
        timeout = 30 * 60 * 1000, // 30 minutes
        checkInterval = 10000 // 10 seconds
    } = options;

    // Validate item can be smelted
    if (!isSmeltable(itemName)) {
        throw new SmeltingError(
            `Cannot smelt ${itemName}. Hint: make sure you are smelting the 'raw' item.`
        );
    }

    let placedFurnace = false;
    let furnaceBlock: Block | null = null;

    try {
        // Find or place furnace
        furnaceBlock = await findOrPlaceFurnace(bot, {
            place: placeFurnace,
            range
        });

        if (!furnaceBlock) {
            throw new SmeltingError('No furnace available and unable to place one');
        }

        // Move to furnace if needed
        if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
            await goToNearestBlock(bot, 'furnace', {
                minDistance: 4,
                maxRange: range
            });
        }

        // Prepare for smelting
        bot.modes.pause('unstuck');
        await bot.lookAt(furnaceBlock.position);

        // Open furnace and check state
        const furnace = await bot.openFurnace(furnaceBlock);
        if (!furnace) {
            throw new SmeltingError('Failed to open furnace');
        }

        // Check if furnace is already in use
        const inputItem = furnace.inputItem();
        if (inputItem && inputItem.type !== getItemId(itemName) && inputItem.count > 0) {
            throw new SmeltingError(
                `Furnace is already smelting ${getItemName(inputItem.type)}`
            );
        }

        // Validate inventory has enough items
        const inventory = getInventoryCounts(bot);
        if (!inventory[itemName] || inventory[itemName] < num) {
            throw new SmeltingError(
                `Not enough ${itemName} to smelt (have ${inventory[itemName] || 0}, need ${num})`
            );
        }

        // Handle fuel
        if (!furnace.fuelItem()) {
            await handleFurnaceFuel(bot, furnace, num);
        }

        // Add items to smelt
        const itemId = getRecipeId(itemName);
        await furnace.putInput(itemId, null, num);

        // Monitor smelting progress
        const result = await monitorSmelting(bot, furnace, {
            targetCount: num,
            timeout,
            checkInterval
        });

        // Clean up
        bot.closeWindow(furnace);
        if (placedFurnace && collectAfterUse) {
            await collectBlock(bot, 'furnace', 1);
        }

        return result;

    } catch (error) {
        // Clean up on error
        if (placedFurnace) {
            await collectBlock(bot, 'furnace', 1).catch(() => {});
        }

        if (error instanceof SmeltingError) {
            throw error;
        }
        throw new SmeltingError(
            `Failed to smelt ${itemName}: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    } finally {
        bot.modes.unpause('unstuck');
    }
}

/**
 * Clear the nearest furnace
 *
 * @param bot - The Minecraft bot instance
 * @param options - Configuration options for clearing
 * @returns Promise resolving to true if furnace was cleared
 *
 * @remarks
 * Removes all items from furnace:
 * - Finds nearest furnace
 * - Removes input, fuel, and output
 * - Optionally stores items in chest
 *
 * @example
 * ```typescript
 * // Clear furnace and store items
 * await clearNearestFurnace(bot, {
 *   storeItems: true,
 *   range: 16
 * });
 * ```
 */
export async function clearNearestFurnace(
    bot: Bot,
    options: FurnaceClearOptions = {}
): Promise<boolean> {
    const {
        range = 32,
        storeItems = false
    } = options;

    try {
        // Find furnace
        const furnaceBlock = getNearestBlock(bot, 'furnace', range);
        if (!furnaceBlock) {
            throw new SmeltingError('No furnace found nearby');
        }

        // Move to furnace if needed
        if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
            await goToNearestBlock(bot, 'furnace', {
                minDistance: 4,
                maxRange: range
            });
        }

        // Open furnace and clear contents
        const furnace = await bot.openFurnace(furnaceBlock);
        const contents = {
            output: furnace.outputItem() ? await furnace.takeOutput() : null,
            input: furnace.inputItem() ? await furnace.takeInput() : null,
            fuel: furnace.fuelItem() ? await furnace.takeFuel() : null
        };

        // Close furnace window before storage
        furnace.close();

        // Format item names for logging
        const outputName = contents.output ?
            `${contents.output.count} ${contents.output.name}` :
            '0 smelted items';
        const inputName = contents.input ?
            `${contents.input.count} ${contents.input.name}` :
            '0 input items';
        const fuelName = contents.fuel ?
            `${contents.fuel.count} ${contents.fuel.name}` :
            '0 fuel items';

        log(bot, `Cleared furnace, received ${outputName}, ${inputName}, and ${fuelName}`);

        // Store items if requested
        if (storeItems && (contents.output || contents.input || contents.fuel)) {
            log(bot, 'Storing furnace contents...');
            const storageResult = await storeFurnaceContents(bot, contents);

            if (!storageResult.success) {
                log(bot, 'Storage failed, keeping items in inventory');
                if (storageResult.failedItems.length > 0) {
                    const failedSummary = storageResult.failedItems
                        .map((item) => `${item.count} ${item.name}`)
                        .join(', ');
                    log(bot, `Failed to store: ${failedSummary}`);
                }
            }
        }

        return true;

    } catch (error) {
        if (error instanceof SmeltingError) {
            throw error;
        }
        throw new SmeltingError(
            `Failed to clear furnace: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Monitor smelting progress
 * @internal
 */
async function monitorSmelting(
    bot: Bot,
    furnace: any,
    options: {
        targetCount: number;
        timeout: number;
        checkInterval: number;
    }
): Promise<FurnaceResult> {
    const { targetCount, timeout, checkInterval } = options;
    const startTime = Date.now();
    let total = 0;
    let collectedLast = true;
    let smeltedItem = null;

    // Initial delay to let smelting start
    await new Promise(resolve => setTimeout(resolve, 200));

    while (total < targetCount) {
        // Check timeout
        if (Date.now() - startTime > timeout) {
            break;
        }

        // Check for interruption
        if (bot.interrupt_code) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));

        // Check output
        let collected = false;
        if (furnace.outputItem()) {
            smeltedItem = await furnace.takeOutput();
            if (smeltedItem) {
                total += smeltedItem.count;
                collected = true;
            }
        }

        // Break if nothing collected twice in a row
        if (!collected && !collectedLast) {
            break;
        }
        collectedLast = collected;
    }

    return {
        success: total === targetCount,
        itemsProcessed: total,
        outputItem: smeltedItem?.name
    };
}

/**
 * Handle furnace fuel requirements
 * @internal
 */
async function handleFurnaceFuel(
    bot: Bot,
    furnace: any,
    itemCount: number
): Promise<void> {
    const fuel = getSmeltingFuel(bot);
    if (!fuel) {
        throw new SmeltingError(
            'No fuel available (need coal, charcoal, or wood)'
        );
    }

    const fuelNeeded = Math.ceil(itemCount / getFuelSmeltOutput(fuel.name));
    if (fuel.count < fuelNeeded) {
        throw new SmeltingError(
            `Not enough ${fuel.name} (have ${fuel.count}, need ${fuelNeeded})`
        );
    }

    await furnace.putFuel(fuel.type, null, fuelNeeded);
    log(bot, `Added ${fuelNeeded} ${fuel.name} as fuel`);
}

/**
 * Find or place a furnace
 * @internal
 */
async function findOrPlaceFurnace(
    bot: Bot,
    options: { place: boolean; range: number }
): Promise<Block | null> {
    let furnace = getNearestBlock(bot, 'furnace', options.range);
    if (furnace) return furnace;

    if (options.place) {
        const hasFurnace = getInventoryCounts(bot)['furnace'] > 0;
        if (hasFurnace) {
            const pos = getNearestFreeSpace(bot, {
                size: 1,
                distance: options.range
            });
            if (pos) {
                await placeBlock(bot, 'furnace', pos.x, pos.y, pos.z);
                return getNearestBlock(bot, 'furnace', options.range);
            }
        }
    }

    return null;
}