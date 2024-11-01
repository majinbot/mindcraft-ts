/**
 * @file Minecraft data utilities and bot initialization
 * @description Provides optimized, type-safe utilities for handling Minecraft items, blocks, crafting, and bot management.
 * This module serves as the central point for accessing and manipulating Minecraft game data.
 */

import minecraftData from 'minecraft-data';
import config from '../config';
import { createBot, Bot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import { plugin as toolPlugin } from 'mineflayer-tool';
import armorManager from 'mineflayer-armor-manager';
import MinecraftData from "minecraft-data";

import prismarineItem from 'prismarine-item';

/**
 * Initialize Minecraft data with version-specific information
 * @remarks This is done once at startup to ensure consistent data access
 */
const MC_VERSION = config.minecraft_version;
const mcdata = minecraftData(MC_VERSION);

// Get the Item constructor from prismarine-item
const Item = prismarineItem(MC_VERSION);
// Type definition for PrismarineItem instances
type PrismarineItem = InstanceType<ReturnType<typeof prismarineItem>>;


/**
 * Extends MinecraftData.Entity with runtime properties
 */
export interface RuntimeEntity extends MinecraftData.Entity {
    metadata?: {
        [key: number]: unknown;
    };
}

/**
 * Core type definitions for Minecraft resources
 * @remarks These types are used throughout the codebase for type safety and better IDE support
 */
export type ItemName = string;
export type BlockName = string;
export type ResourceName = ItemName | BlockName;

/**
 * Cache maps for efficient resource lookups
 * @remarks Using Maps instead of objects for better performance with frequent lookups
 */
const RESOURCE_MAPS = {
    items: new Map<string, MinecraftData.Item>(),
    blocks: new Map<string, MinecraftData.Block>(),
    itemsById: new Map<number, MinecraftData.Item>(),
    blocksById: new Map<number, MinecraftData.Block>()
} as const;

/**
 * Initializes cache maps for faster resource lookups
 * @remarks This is called once at startup to populate the lookup tables
 * @internal
 */
function initializeCaches(): void {
    Object.entries(mcdata.items).forEach(([id, item]) => {
        RESOURCE_MAPS.itemsById.set(Number(id), item);
        RESOURCE_MAPS.items.set(item.name, item);
    });

    Object.entries(mcdata.blocks).forEach(([id, block]) => {
        RESOURCE_MAPS.blocksById.set(Number(id), block);
        RESOURCE_MAPS.blocks.set(block.name, block);
    });
}
initializeCaches();

/**
 * Defines the available wood types in Minecraft
 * @remarks Used for crafting and block identification
 */
export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'] as const;

/**
 * Defines block variants available for each wood type
 * @remarks Used for identifying wood-based blocks and their variants
 */
export const MATCHING_WOOD_BLOCKS = [
    'log', 'planks', 'sign', 'boat', 'fence_gate', 'door', 'fence',
    'slab', 'stairs', 'button', 'pressure_plate', 'trapdoor'
] as const;

/**
 * Defines all available wool colors
 * @remarks Used for dye crafting and sheep interactions
 */
export const WOOL_COLORS = [
    'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
    'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
    'brown', 'green', 'red', 'black'
] as const;

export type WoodType = typeof WOOD_TYPES[number];
export type WoodBlockType = typeof MATCHING_WOOD_BLOCKS[number];
export type WoolColor = typeof WOOL_COLORS[number];

/**
 * Maps cooked items to their raw ingredients for smelting recipes
 * @remarks Used for furnace operations and crafting
 */
const SMELTING_MAP: Readonly<Record<ItemName, ItemName>> = {
    'baked_potato': 'potato',
    'steak': 'raw_beef',
    'cooked_chicken': 'raw_chicken',
    'cooked_cod': 'raw_cod',
    'cooked_mutton': 'raw_mutton',
    'cooked_porkchop': 'raw_porkchop',
    'cooked_rabbit': 'raw_rabbit',
    'cooked_salmon': 'raw_salmon',
    'dried_kelp': 'kelp',
    'iron_ingot': 'raw_iron',
    'gold_ingot': 'raw_gold',
    'copper_ingot': 'raw_copper',
    'glass': 'sand'
} as const;

/**
 * Maps items to their source animals
 * @remarks Used for farming and resource gathering
 */
const ANIMAL_SOURCE_MAP: Readonly<Record<ItemName, string>> = {
    'raw_beef': 'cow',
    'raw_chicken': 'chicken',
    'raw_cod': 'cod',
    'raw_mutton': 'sheep',
    'raw_porkchop': 'pig',
    'raw_rabbit': 'rabbit',
    'raw_salmon': 'salmon',
    'leather': 'cow',
    'wool': 'sheep'
} as const;

/**
 * Defines burn duration for different fuel types (in items)
 * @remarks Used for furnace operations
 */
const FUEL_VALUES: Readonly<Record<string, number>> = {
    'coal': 8,
    'charcoal': 8,
    'coal_block': 80,
    'lava_bucket': 100
} as const;

/**
 * Set of items that can be smelted but don't follow the 'raw_' naming pattern
 * @remarks Used for furnace operations and crafting checks
 */
const MISC_SMELTABLES = new Set([
    'beef', 'chicken', 'cod', 'mutton', 'porkchop', 'rabbit',
    'salmon', 'tropical_fish', 'potato', 'kelp', 'sand',
    'cobblestone', 'clay_ball'
]);

/**
 * Set of animals that can be hunted for resources
 * @remarks Used for mob targeting and resource gathering
 */
const HUNTABLE_ANIMALS = new Set([
    'chicken', 'cow', 'llama', 'mooshroom', 'pig', 'rabbit', 'sheep'
]);

/**
 * Initializes a Minecraft bot with all necessary plugins
 * @param username - The username for the bot
 * @returns Configured bot instance ready for use
 * @remarks This is the primary way to create a new bot instance with all required plugins
 */
export function initBot(username: string): Bot {
    const bot = createBot({
        username,
        host: config.host,
        port: config.port,
        auth: config.auth,
        version: MC_VERSION,
        //
        skipValidation: true,
        hideErrors: false
    });

    // Load plugins correctly
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectblock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(toolPlugin);

    return bot;
}

/**
 * Checks if a mob is a huntable animal
 * @param mob - The entity to check
 * @returns boolean indicating if mob is huntable
 * @remarks Takes into account baby animals (metadata[16])
 */
export function isHuntable(mob: RuntimeEntity | null): boolean {
    if (!mob?.name) return false;
    return HUNTABLE_ANIMALS.has(mob.name.toLowerCase()) && !mob.metadata?.[16];
}

/**
 * Checks if a mob is hostile
 * @param mob - The entity to check
 * @returns boolean indicating if mob is hostile
 * @remarks Excludes friendly golems from hostile check
 */
export function isHostile(mob: RuntimeEntity | null): boolean {
    if (!mob?.name) return false;
    return (mob.type === 'mob' || mob.type === 'hostile') &&
        !['iron_golem', 'snow_golem'].includes(mob.name);
}

/**
 * Resource ID and name lookups
 */

/**
 * Gets the numeric ID for an item name
 * @param name - The name of the item to look up
 * @returns The item ID or null if not found
 * @remarks Uses cached Map for faster lookups
 */
export function getItemId(name: ItemName): number | null {
    return RESOURCE_MAPS.items.get(name)?.id ?? null;
}

/**
 * Gets the name for an item ID
 * @param id - The numeric ID to look up
 * @returns The item name or null if not found
 * @remarks Uses cached Map for faster lookups
 */
export function getItemName(id: number): ItemName | null {
    return RESOURCE_MAPS.itemsById.get(id)?.name ?? null;
}

/**
 * Gets the numeric ID for a block name
 * @param name - The name of the block to look up
 * @returns The block ID or null if not found
 * @remarks Uses cached Map for faster lookups
 */
export function getBlockId(name: BlockName): number | null {
    return RESOURCE_MAPS.blocks.get(name)?.id ?? null;
}

/**
 * Gets the name for a block ID
 * @param id - The numeric ID to look up
 * @returns The block name or null if not found
 * @remarks Uses cached Map for faster lookups
 */
export function getBlockName(id: number): BlockName | null {
    return RESOURCE_MAPS.blocksById.get(id)?.name ?? null;
}

/**
 * Resource collection utilities
 */

/**
 * Gets all items in the game
 * @param ignore - Optional array of item names to exclude
 * @returns Array of all items not in the ignore list
 * @remarks Uses Set for efficient filtering
 */
export function getAllItems(ignore: ItemName[] = []): MinecraftData.Item[] {
    const ignoreSet = new Set(ignore);
    return Array.from(RESOURCE_MAPS.items.values())
        .filter(item => !ignoreSet.has(item.name));
}

/**
 * Gets all blocks in the game
 * @param ignore - Optional array of block names to exclude
 * @returns Array of all blocks not in the ignore list
 * @remarks Uses Set for efficient filtering
 */
export function getAllBlocks(ignore: BlockName[] = []): MinecraftData.Block[] {
    const ignoreSet = new Set(ignore);
    return Array.from(RESOURCE_MAPS.blocks.values())
        .filter(block => !ignoreSet.has(block.name));
}

/**
 * Gets all item IDs
 * @param ignore - Optional array of item names to exclude
 * @returns Array of all item IDs not in the ignore list
 */
export function getAllItemIds(ignore: ItemName[] = []): number[] {
    return getAllItems(ignore).map(item => item.id);
}

/**
 * Gets all block IDs
 * @param ignore - Optional array of block names to exclude
 * @returns Array of all block IDs not in the ignore list
 */
export function getAllBlockIds(ignore: BlockName[] = []): number[] {
    return getAllBlocks(ignore).map(block => block.id);
}

/**
 * Gets all biomes data
 * @returns All biome data from minecraft-data
 */
export function getAllBiomes(): typeof mcdata.biomes {
    return mcdata.biomes;
}

/**
 * Crafting and smelting utilities
 */

/**
 * Checks if an item can be smelted
 * @param itemName - The name of the item to check
 * @returns boolean indicating if the item is smeltable
 * @remarks Checks both pattern matching and explicit list
 */
export function isSmeltable(itemName: ItemName): boolean {
    return itemName.includes('raw') ||
        itemName.includes('log') ||
        MISC_SMELTABLES.has(itemName);
}

/**
 * Finds available fuel in bot's inventory
 * @param bot - The bot instance to check
 * @returns First available fuel item or null if none found
 * @remarks Checks for all valid fuel types in order of efficiency
 */
export function getSmeltingFuel(bot: Bot): PrismarineItem | null {
    return bot.inventory.items().find(i =>
        i.name === 'coal' ||
        i.name === 'charcoal' ||
        i.name.includes('log') ||
        i.name.includes('planks') ||
        i.name === 'coal_block' ||
        i.name === 'lava_bucket'
    ) ?? null;
}

/**
 * Gets the smelting duration for a fuel type
 * @param fuelName - The name of the fuel item
 * @returns Number of items that can be smelted with one unit of this fuel
 */
export function getFuelSmeltOutput(fuelName: string): number {
    if (fuelName.includes('log') || fuelName.includes('planks')) return 1.5;
    return FUEL_VALUES[fuelName] ?? 0;
}

/**
 * Gets the raw ingredient needed for a smelted item
 * @param itemName - The name of the smelted item
 * @returns The name of the required ingredient or undefined
 */
export function getItemSmeltingIngredient(itemName: ItemName): ItemName | undefined {
    return SMELTING_MAP[itemName];
}

/**
 * Gets all blocks that can drop a specific item
 * @param itemName - The name of the item to check
 * @returns Array of block names that can drop this item
 */
export function getItemBlockSources(itemName: ItemName): BlockName[] {
    const itemId = getItemId(itemName);
    if (!itemId) return [];

    return getAllBlocks()
        .filter(block => block.drops.includes(itemId))
        .map(block => block.name);
}

/**
 * Gets the animal that drops a specific item
 * @param itemName - The name of the item to check
 * @returns The name of the source animal or undefined
 */
export function getItemAnimalSource(itemName: ItemName): string | undefined {
    return ANIMAL_SOURCE_MAP[itemName];
}

/**
 * Gets the required tool for harvesting a block
 * @param blockName - The name of the block to check
 * @returns The name of the required tool or null
 */
export function getBlockTool(blockName: BlockName): ItemName | null {
    const block = RESOURCE_MAPS.blocks.get(blockName);
    if (!block?.harvestTools) return null;

    const toolId = Object.keys(block.harvestTools)[0];
    return getItemName(Number(toolId));
}

/**
 * Creates a new item instance
 * @param name - The name of the item to create
 * @param amount - Optional amount (defaults to 1)
 * @returns New PrismarineItem instance
 * @throws Error if item name is invalid
 */
export function makeItem(name: ItemName, amount: number = 1): PrismarineItem {
    const itemId = getItemId(name);
    if (!itemId) throw new Error(`Invalid item name: ${name}`);
    return new Item(itemId, amount);
}

/**
 * Resource calculation utilities
 */

/**
 * Processes recipe ingredients and updates the recipe object
 * @param ingredientItem - The ingredient item to process
 * @param recipe - The recipe object to update
 * @remarks Handles all ingredient formats and accumulates counts
 * @internal
 */
function processRecipeIngredients(
    ingredientItem: MinecraftData.RecipeItem,
    recipe: Record<string, number>
): void {
    const ingredientId = getRecipeItemId(ingredientItem);
    if (ingredientId === null || ingredientId < 0) return;

    const ingredientName = getItemName(ingredientId);
    if (!ingredientName) return;

    const count = getRecipeItemCount(ingredientItem);
    recipe[ingredientName] = (recipe[ingredientName] ?? 0) + count;
}

/**
 * Calculates resource limits and identifies bottlenecks for crafting operations
 * @param availableItems - Map of items in inventory and their quantities
 * @param requiredItems - Map of items needed for recipe and their quantities per craft
 * @param discrete - When true, returns whole numbers for crafting. When false, returns exact ratios for mixing
 * @returns Object containing maximum possible operations and the limiting resource
 * @remarks
 * This function analyzes resource availability to determine how many times an operation can be performed.
 * For crafting (discrete=true), it returns whole numbers as partial crafts aren't possible.
 * For mixing (discrete=false), it returns exact ratios for precise resource calculations.
 *
 * @example
 * Crafting example (discrete=true):
 * ```typescript
 * const available = { 'planks': 10, 'stick': 20 };
 * const required = { 'planks': 2, 'stick': 3 };
 * const result = calculateLimitingResource(available, required);
 * // result = { num: 5, limitingResource: 'planks' }
 * ```
 *
 * Mixing example (discrete=false):
 * ```typescript
 * const available = { 'water': 1000, 'dye': 150 };
 * const required = { 'water': 100, 'dye': 25 };
 * const result = calculateLimitingResource(available, required, false);
 * // result = { num: 6.0, limitingResource: 'dye' }
 * ```
 */
export function calculateLimitingResource<T extends string>(
    availableItems: Record<T, number>,
    requiredItems: Record<T, number>,
    discrete = true
): { num: number; limitingResource: T | null } {
    let limitingResource: T | null = null;
    let num = Infinity;

    // Iterate through required items to find the limiting factor
    for (const [itemType, required] of Object.entries(requiredItems) as [T, number][]) {
        const available = availableItems[itemType] ?? 0;
        const possible = available / required;

        if (possible < num) {
            limitingResource = itemType;
            num = possible;
        }
    }

    return {
        num: discrete ? Math.floor(num) : num,
        limitingResource
    };
}

/**
 * Retrieves and normalizes all available crafting recipes for an item
 * @param itemName - The standardized name of the item to craft
 * @returns Array of ingredient requirement maps, or null if uncraftable
 * @remarks
 * Returns all possible ways to craft the specified item, with each recipe
 * normalized to a map of required ingredients and their quantities. Returns
 * null if the item cannot be crafted or doesn't exist.
 *
 * Handles both shaped and shapeless recipes, converting complex recipe
 * specifications into simple ingredient requirement maps for easier processing.
 *
 * @example
 * ```typescript
 * const recipes = getItemCraftingRecipes('stick');
 * // recipes = [{ 'oak_planks': 2 }]
 *
 * const nonCraftable = getItemCraftingRecipes('diamond');
 * // nonCraftable = null
 * ```
 */
export function getItemCraftingRecipes(itemName: ItemName): Record<string, number>[] | null {
    const itemId = getItemId(itemName);
    if (!itemId || !mcdata.recipes[itemId]) return null;

    const recipes = mcdata.recipes[itemId];

    return recipes.map(recipe => {
        const result: Record<string, number> = {};

        function processIngredients(item: MinecraftData.RecipeItem) {
            const id = getRecipeItemId(item);
            if (id === null || id < 0) return;

            const name = getItemName(id);
            if (!name) return;

            const count = getRecipeItemCount(item);
            result[name] = (result[name] ?? 0) + count;
        }

        if ('inShape' in recipe && recipe.inShape) {
            for (const row of recipe.inShape) {
                for (const ingredient of row) {
                    processIngredients(ingredient);
                }
            }
        }

        if ('ingredients' in recipe && recipe.ingredients) {
            for (const ingredient of recipe.ingredients) {
                processIngredients(ingredient);
            }
        }

        return result;
    });
}

/**
 * Gets the item count from a recipe component with appropriate defaults
 * @param item - Recipe item specification in any valid format
 * @returns Number of items required by this recipe component
 * @remarks
 * Handles all MinecraftData recipe item formats:
 * - Array format: Always represents a single item
 * - Object format: Uses specified count or defaults to 1
 * - Number format: Represents a single item
 *
 * This function is used internally by recipe processing to normalize
 * item counts across different recipe specification formats.
 * @internal
 */
function getRecipeItemCount(item: MinecraftData.RecipeItem): number {
    if (Array.isArray(item)) {
        return 1;
    }
    if (typeof item === 'object' && item !== null && 'count' in item) {
        return item.count ?? 1;
    }
    return 1;
}

/**
 * Extracts the item ID from a recipe component handling all valid formats
 * @param item - Recipe item specification in any valid format
 * @returns Item ID or null if invalid/empty
 * @remarks
 * Handles all MinecraftData recipe item formats:
 * - Null: Returns null (invalid/empty slot)
 * - Array: [id] or [id, metadata] format, extracts first element
 * - Number: Direct item ID
 * - Object: Extracts id property
 *
 * Used internally to normalize item identification across different
 * recipe specification formats.
 * @internal
 */
function getRecipeItemId(item: MinecraftData.RecipeItem): number | null {
    if (item === null) return null;
    if (Array.isArray(item)) {
        return item[0] ?? null;
    }
    if (typeof item === 'number') {
        return item;
    }
    return item.id ?? null;
}

/**
 * Extracts a complete list of required ingredients from a recipe
 * @param recipe - MinecraftData recipe specification
 * @returns Map of item names to required quantities
 * @remarks
 * This function processes both shaped and shapeless recipes to produce a
 * normalized ingredient list. For shaped recipes, it preserves the total
 * count of each ingredient regardless of position in the crafting grid.
 *
 * The returned ingredient map uses the standardized item names as keys
 * (not IDs) for better readability and consistency with inventory systems.
 *
 * @example
 * ```typescript
 * const recipe = mcdata.Recipes[itemId][0]; // Get first recipe for an item
 * const ingredients = ingredientsFromPrismarineRecipe(recipe);
 * // ingredients = { 'oak_planks': 6, 'stick': 1 }
 * ```
 */
export function ingredientsFromPrismarineRecipe(
    recipe: MinecraftData.Recipe
): Record<ItemName, number> {
    const ingredients: Record<ItemName, number> = {};

    function processIngredient(item: MinecraftData.RecipeItem) {
        const id = getRecipeItemId(item);
        if (id === null || id < 0) return;

        const name = getItemName(id);
        if (!name) return;

        const count = getRecipeItemCount(item);
        ingredients[name] = (ingredients[name] ?? 0) + count;
    }

    if ('inShape' in recipe && recipe.inShape) {
        for (const row of recipe.inShape) {
            for (const item of row) {
                processIngredient(item);
            }
        }
    }

    if ('ingredients' in recipe && recipe.ingredients) {
        for (const item of recipe.ingredients) {
            processIngredient(item);
        }
    }

    return ingredients;
}

// Export the mcdata instance for advanced use cases
export { mcdata };