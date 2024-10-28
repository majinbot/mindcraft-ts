import type { Block } from 'prismarine-block';
import { log, type ExtendedBot } from '../bot';
import type { McDataContext } from '../../types';
import { ingredientsFromPrismarineRecipe } from '../crafting';
import { getSmeltingFuel, getFuelSmeltOutput, isSmeltable } from '../items';

/**
 * Makes the bot craft an item using available materials
 */
export async function craftItem(
    bot: ExtendedBot,
    ctx: McDataContext,
    itemName: string,
    count = 1,
    craftingTable?: Block
): Promise<boolean> {
    try {
        // Find matching recipes
        const recipes = bot.recipesFor(
            ctx.mcData.itemsByName[itemName].id,
            null,
            count,
            craftingTable || null
        );

        if (recipes.length === 0) {
            log(bot, `No recipe found for ${itemName}`);
            return false;
        }

        // Get required ingredients for first recipe
        const recipe = recipes[0];
        const ingredients = ingredientsFromPrismarineRecipe(ctx, recipe);

        // Check if we have all ingredients
        for (const [item, amount] of Object.entries(ingredients)) {
            const available = bot.inventory.items().filter(i => i.name === item)
                .reduce((sum, i) => sum + i.count, 0);
            
            if (available < amount) {
                log(bot, `Missing ${amount - available} ${item}`);
                return false;
            }
        }

        // Craft the item
        await bot.craft(recipe, count, craftingTable);
        log(bot, `Crafted ${count} ${itemName}`, true);
        return true;

    } catch (err) {
        log(bot, `Failed to craft ${itemName}: ${(err as Error).message}`);
        return false;
    }
}

/**
 * Makes the bot smelt items using a furnace
 */
export async function smeltItems(
    bot: ExtendedBot,
    furnaceBlock: Block,
    itemName: string,
    count = 1
): Promise<boolean> {
    if (!isSmeltable(itemName)) {
        log(bot, `${itemName} cannot be smelted`);
        return false;
    }

    try {
        // Open furnace
        const furnace = await bot.openFurnace(furnaceBlock);

        // Get fuel
        const fuel = getSmeltingFuel(bot);
        if (!fuel) {
            log(bot, 'No fuel available');
            furnace.close();
            return false;
        }

        // Calculate how much fuel we need
        const fuelNeeded = Math.ceil(count / getFuelSmeltOutput(fuel.name));
        if (fuel.count < fuelNeeded) {
            log(bot, `Not enough fuel - need ${fuelNeeded} ${fuel.name}`);
            furnace.close();
            return false;
        }

        // Get input items
        const inputItems = bot.inventory.items().filter(i => i.name === itemName);
        const totalInput = inputItems.reduce((sum, i) => sum + i.count, 0);
        if (totalInput < count) {
            log(bot, `Not enough ${itemName} - have ${totalInput}, need ${count}`);
            furnace.close();
            return false;
        }

        // Add fuel and input
        await furnace.putFuel(fuel.type, null, fuelNeeded);
        await furnace.putInput(inputItems[0].type, null, count);

        // Wait for smelting to complete
        await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
                if (furnace.progress >= 1) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });

        // Collect output
        await furnace.takeOutput();
        furnace.close();
        
        log(bot, `Smelted ${count} ${itemName}`, true);
        return true;

    } catch (err) {
        log(bot, `Failed to smelt ${itemName}: ${(err as Error).message}`);
        return false;
    }
}
