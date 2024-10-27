/**
 * Minecraft constants and type definitions
 * @module mc/constants
 */

/**
 * All available wood types in Minecraft
 * Used for crafting recipes and identifying wood-based blocks
 */
export const WOOD_TYPES = [
    'oak',
    'spruce',
    'birch',
    'jungle',
    'acacia',
    'dark_oak',
    'mangrove', // Added in 1.19
    'bamboo', // Added in 1.20
    'cherry' // Added in 1.20
] as const;

export type WoodType = (typeof WOOD_TYPES)[number];

/**
 * All block variants that can be made from wood
 * Used for crafting and identifying wood-based blocks
 */
export const MATCHING_WOOD_BLOCKS = [
    'log',
    'planks',
    'sign',
    'hanging_sign', // Added in 1.20
    'boat',
    'chest_boat', // Added in 1.19
    'fence_gate',
    'door',
    'fence',
    'slab',
    'stairs',
    'button',
    'pressure_plate',
    'trapdoor'
] as const;

export type WoodBlockType = (typeof MATCHING_WOOD_BLOCKS)[number];

/**
 * All available wool colors in Minecraft
 * Used for crafting and identifying wool/dye related items
 */
export const WOOL_COLORS = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
] as const;

export type WoolColor = (typeof WOOL_COLORS)[number];

/**
 * Mapping of cooked food items to their raw ingredients
 */
export const COOKING_INGREDIENTS = {
    baked_potato: 'potato',
    steak: 'raw_beef',
    cooked_chicken: 'raw_chicken',
    cooked_cod: 'raw_cod',
    cooked_mutton: 'raw_mutton',
    cooked_porkchop: 'raw_porkchop',
    cooked_rabbit: 'raw_rabbit',
    cooked_salmon: 'raw_salmon',
    dried_kelp: 'kelp',
    iron_ingot: 'raw_iron',
    gold_ingot: 'raw_gold',
    copper_ingot: 'raw_copper',
    glass: 'sand'
} as const;

/**
 * Mapping of items to their source animals
 */
export const ANIMAL_SOURCES = {
    raw_beef: 'cow',
    raw_chicken: 'chicken',
    raw_cod: 'cod',
    raw_mutton: 'sheep',
    raw_porkchop: 'pig',
    raw_rabbit: 'rabbit',
    raw_salmon: 'salmon',
    leather: 'cow',
    wool: 'sheep'
} as const;

/**
 * Items that can be smelted but don't follow the 'raw_' naming pattern
 */
export const MISC_SMELTABLES = [
    'beef',
    'chicken',
    'cod',
    'mutton',
    'porkchop',
    'rabbit',
    'salmon',
    'tropical_fish',
    'potato',
    'kelp',
    'sand',
    'cobblestone',
    'clay_ball'
] as const;

export type SmeltableItem = (typeof MISC_SMELTABLES)[number];

/**
 * Mapping of fuel types to their smelting duration in items
 */
export const FUEL_BURN_TIME = {
    coal: 8,
    charcoal: 8,
    coal_block: 80,
    lava_bucket: 100,
    log: 1.5,
    planks: 1.5
} as const;

export type FuelType = keyof typeof FUEL_BURN_TIME;