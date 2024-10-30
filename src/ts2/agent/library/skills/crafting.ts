import {ExtendedBot, FreeSpaceOptions} from "../../../types/mc";
import {getInventoryCounts, getNearestBlock, getNearestFreeSpace} from "../world";
import { Recipe as MinecraftRecipe } from "minecraft-data";
import { Recipe as PrismarineRecipe } from "prismarine-recipe";
import {calculateLimitingResource, getItemId, ingredientsFromPrismarineRecipe} from "../../../utils/mcdata";
import {Block} from "prismarine-block";
import {collectBlock, placeBlock} from "./blocks";
import {log} from "./index";
import {goToNearestBlock} from "./navigation";

/**
 * Configuration options for crafting operations
 */
interface CraftingOptions {
    /** Whether to place a crafting table if needed */
    placeCraftingTable?: boolean;
    /** Maximum range to search for crafting table */
    range?: number;
    /** Whether to collect crafting table after use */
    collectAfterUse?: boolean;
}

/**
 * Custom error for crafting operations
 */
export class CraftingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CraftingError';
    }
}

/**
 * Ensure itemId is available and valid
 * @internal
 */
export function getRecipeId(itemName: string): number {
    const id = getItemId(itemName);
    if (id === null) {
        throw new CraftingError(`Invalid item name: ${itemName}`);
    }
    return id;
}

/**
 * Convert Prismarine recipe to Minecraft recipe
 * @internal
 */
export function convertRecipe(recipe: PrismarineRecipe): MinecraftRecipe {
    return recipe as unknown as MinecraftRecipe;
}

/**
 * Craft items from a recipe
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of item to craft
 * @param num - Number of items to craft (default: 1)
 * @param options - Configuration options for crafting
 * @returns Promise resolving to true if crafting was successful
 *
 * @remarks
 * Handles both regular crafting and crafting table recipes:
 * - Automatically finds or places crafting table if needed
 * - Verifies resource availability
 * - Manages tool and armor equipping
 * - Supports batch crafting
 *
 * @throws {CraftingError} If crafting fails or resources are insufficient
 *
 * @example
 * ```typescript
 * // Craft without crafting table
 * await craftRecipe(bot, "stick", 4);
 *
 * // Craft with table
 * await craftRecipe(bot, "chest", 1, {
 *   placeCraftingTable: true,
 *   collectAfterUse: true
 * });
 * ```
 */
export async function craftRecipe(
    bot: ExtendedBot,
    itemName: string,
    num: number = 1,
    options: CraftingOptions = {}
): Promise<boolean> {
    const {
        placeCraftingTable = true,
        range = 32,
        collectAfterUse = true
    } = options;

    let placedTable = false;

    try {
        const itemId = getRecipeId(itemName);

        // Get recipes that don't require a crafting table
        let recipes = bot.recipesFor(itemId, null, 1, null);
        let craftingTable: Block | null = null;

        // Check if we need a crafting table
        if (!recipes || recipes.length === 0) {
            recipes = bot.recipesFor(itemId, null, 1, true);

            if (!recipes || recipes.length === 0) {
                throw new CraftingError(`You do not have the resources to craft ${itemName}`);
            }

            // Find or place crafting table
            craftingTable = await findOrPlaceCraftingTable(bot, {
                place: placeCraftingTable,
                range
            });

            if (!craftingTable) {
                throw new CraftingError(`Crafting ${itemName} requires a crafting table`);
            }

            // Get recipes with crafting table
            recipes = bot.recipesFor(itemId, null, 1, craftingTable);
            if (craftingTable && !getNearestBlock(bot, 'crafting_table', range)) {
                placedTable = true;
            }
        }

        // Move to crafting table if needed
        if (craftingTable && bot.entity.position.distanceTo(craftingTable.position) > 4) {
            await goToNearestBlock(bot, 'crafting_table', {
                minDistance: 4,
                maxRange: range
            });
        }

        // Calculate how many we can craft
        const recipe = recipes[0];
        const inventory = getInventoryCounts(bot);
        const requiredIngredients = ingredientsFromPrismarineRecipe(convertRecipe(recipe));
        const craftLimit = calculateLimitingResource(inventory, requiredIngredients);

        // Perform crafting
        const craftAmount = Math.min(craftLimit.num, num);
        await bot.craft(recipe, craftAmount, craftingTable || undefined);

        // Report results
        if (craftLimit.num < num) {
            const currentCount = getInventoryCounts(bot)[itemName] || 0;
            log(bot, `Not enough ${craftLimit.limitingResource} to craft ${num}, ` +
                `crafted ${craftLimit.num}. You now have ${currentCount} ${itemName}`);
        } else {
            const currentCount = getInventoryCounts(bot)[itemName] || 0;
            log(bot, `Successfully crafted ${itemName}, you now have ${currentCount} ${itemName}`);
        }

        // Clean up crafting table
        if (placedTable && collectAfterUse) {
            await collectBlock(bot, 'crafting_table', 1);
        }

        // Equip any armor that was crafted
        await bot.armorManager.equipAll();

        return craftAmount > 0;

    } catch (error) {
        // Clean up on error
        if (placedTable) {
            await collectBlock(bot, 'crafting_table', 1).catch(() => {});
        }

        if (error instanceof CraftingError) {
            throw error;
        }
        throw new CraftingError(`Failed to craft ${itemName}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
    }
}

/**
 * Find or place a crafting table
 * @internal
 */
async function findOrPlaceCraftingTable(
    bot: ExtendedBot,
    options: { place: boolean; range: number }
): Promise<Block | null> {
    // Look for existing table
    let craftingTable = getNearestBlock(bot, 'crafting_table', options.range);
    if (craftingTable) return craftingTable;

    // Place new table if allowed
    if (options.place) {
        const hasTable = getInventoryCounts(bot)['crafting_table'] > 0;
        if (hasTable) {
            const freeSpaceOptions: FreeSpaceOptions = {
                size: 1,
                distance: 6
            };
            const pos = getNearestFreeSpace(bot, freeSpaceOptions);
            if (pos) {
                await placeBlock(bot, 'crafting_table', pos.x, pos.y, pos.z);
                return getNearestBlock(bot, 'crafting_table', options.range);
            }
        }
    }

    return null;
}


/**
 * Get list of missing ingredients for a recipe
 *
 * @param bot - The Minecraft bot instance
 * @param recipe - The recipe to check
 * @returns Map of missing ingredients and quantities
 *
 * @example
 * ```typescript
 * const recipe = bot.recipesFor(mc.getItemId("chest"))[0];
 * const missing = getMissingIngredients(bot, recipe);
 * // missing = { "oak_planks": 2 }
 * ```
 */
export function getMissingIngredients(
    bot: ExtendedBot,
    recipe: MinecraftRecipe | PrismarineRecipe
): Record<string, number> {
    const inventory = getInventoryCounts(bot);
    const required = ingredientsFromPrismarineRecipe(convertRecipe(recipe as PrismarineRecipe));
    const missing: Record<string, number> = {};

    for (const [item, count] of Object.entries(required)) {
        const available = inventory[item] || 0;
        if (available < count) {
            missing[item] = count - available;
        }
    }

    return missing;
}


/**
 * Check if bot can craft an item
 *
 * @param bot - The Minecraft bot instance
 * @param itemName - Name of item to check
 * @param options - Crafting options
 * @returns True if item can be crafted
 *
 * @example
 * ```typescript
 * // Check if we can craft a chest
 * const canCraft = canCraftItem(bot, "chest", {
 *   placeCraftingTable: true
 * });
 * ```
 */
export function canCraftItem(
    bot: ExtendedBot,
    itemName: string,
    options: CraftingOptions = {}
): boolean {
    const itemId = getRecipeId(itemName);

    // Check non-table recipes first
    let recipes = bot.recipesFor(itemId, null, 1, null);

    // Check table recipes if allowed
    if ((!recipes || recipes.length === 0) && options.placeCraftingTable) {
        const hasTable = getInventoryCounts(bot)['crafting_table'] > 0;
        const nearbyTable = getNearestBlock(bot, 'crafting_table', options.range || 32);

        if (hasTable || nearbyTable) {
            recipes = bot.recipesFor(itemId, null, 1, true);
        }
    }

    return recipes !== null && recipes.length > 0;
}