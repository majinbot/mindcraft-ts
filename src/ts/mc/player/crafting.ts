/**
 * Crafting and recipe-related functionality
 * @module mc/player/crafting
 */
import type { McDataContext, ItemName, CraftingRecipe, LimitingResourceResult } from '../types';
import { getItemName } from './items';
import type { Recipe as PrismarineRecipe } from 'prismarine-recipe';
import type { RecipeItem } from 'minecraft-data';

type ProcessedRecipe = CraftingRecipe;

/**
 * Process a prismarine recipe format (used by some mineflayer plugins)
 * Returns the number of ingredients required to use the recipe once.
 */
export function ingredientsFromPrismarineRecipe(ctx: McDataContext, recipe: PrismarineRecipe): CraftingRecipe {
    const requiredIngredients: CraftingRecipe = {};

    // Handle shaped recipes
    if ('inShape' in recipe && recipe.inShape) {
        for (const row of recipe.inShape) {
            for (const item of row) {
                if (!item || item.id < 0) continue;
                const name = getItemName(ctx, item.id);
                if (!name) continue;
                requiredIngredients[name] = (requiredIngredients[name] || 0) + item.count;
            }
        }
    }

    // Handle shapeless recipes
    if ('ingredients' in recipe && recipe.ingredients) {
        for (const item of recipe.ingredients) {
            if (!item || item.id < 0) continue;
            const name = getItemName(ctx, item.id);
            if (!name) continue;
            requiredIngredients[name] = (requiredIngredients[name] || 0) + item.count;
        }
    }

    return requiredIngredients;
}

/**
 * Extracts the ID from a RecipeItem in any of its possible forms
 */
function getRecipeItemId(item: RecipeItem): number | null {
    if (item === null) return null;
    if (typeof item === 'number') return item;
    if (Array.isArray(item)) {
        return item[0] ?? null;
    }
    return item.id ?? null;
}

/**
 * Gets all crafting recipes for a given item using minecraft-data format
 */
export function getItemCraftingRecipes(ctx: McDataContext, itemName: ItemName): ProcessedRecipe[] | null {
    const itemId = ctx.mcData.itemsByName[itemName]?.id;
    if (!itemId || !ctx.mcData.recipes[itemId]) return null;

    const recipes: ProcessedRecipe[] = [];

    for (const recipe of ctx.mcData.recipes[itemId]) {
        const currentRecipe: ProcessedRecipe = {};

        if ('inShape' in recipe) {
            // Handle shaped recipes (specific arrangement)
            for (const row of recipe.inShape) {
                for (const ingredient of row) {
                    const id = getRecipeItemId(ingredient);
                    if (id === null) continue;
                    const name = getItemName(ctx, id);
                    if (!name) continue;
                    currentRecipe[name] = (currentRecipe[name] || 0) + 1;
                }
            }
        } else if ('ingredients' in recipe) {
            // Handle shapeless recipes
            for (const ingredient of recipe.ingredients) {
                const id = getRecipeItemId(ingredient);
                if (id === null) continue;
                const name = getItemName(ctx, id);
                if (!name) continue;
                currentRecipe[name] = (currentRecipe[name] || 0) + 1;
            }
        }

        if (Object.keys(currentRecipe).length > 0) {
            recipes.push(currentRecipe);
        }
    }

    return recipes;
}

/**
 * Calculates how many times a recipe can be crafted with available resources
 */
export function calculateLimitingResource<T extends string>(
    availableItems: Record<T, number>,
    requiredItems: Record<T, number>,
    discrete = true
): LimitingResourceResult<T> {
    let limitingResource: T | null = null;
    let num = Infinity;

    for (const itemType in requiredItems) {
        const available = availableItems[itemType] || 0;
        const required = requiredItems[itemType];

        if (required <= 0) continue;

        const possibleCrafts = available / required;
        if (possibleCrafts < num) {
            num = possibleCrafts;
            limitingResource = itemType;
        }
    }

    return {
        num: discrete ? Math.floor(num) : num,
        limitingResource
    };
}