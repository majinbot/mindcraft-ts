import {ExtendedBot, ExtendedItem} from "../../../types/mc";

/**
 * Equips the weapon with the highest attack damage from the bot's inventory
 *
 * @param bot - The Minecraft bot instance
 * @returns Promise that resolves when equipment change is complete
 *
 * @remarks
 * Prioritizes swords and axes (excluding pickaxes) first, then falls back to
 * pickaxes and shovels if no primary weapons are found. Sorts by attack damage
 * to select the most effective weapon.
 *
 * @example
 * ```typescript
 * await equipHighestAttack(bot); // Bot will equip its strongest weapon
 * ```
 */
export async function equipHighestAttack(bot: ExtendedBot): Promise<void> {
    const inventory = bot.inventory.items();

    // First try to find primary weapons (swords and regular axes)
    let weapons = inventory.filter((item): item is ExtendedItem =>
        item.name.includes('sword') ||
        (item.name.includes('axe') && !item.name.includes('pickaxe'))
    );

    // If no primary weapons found, look for tools that can be used as weapons
    if (weapons.length === 0) {
        weapons = inventory.filter((item): item is ExtendedItem =>
            item.name.includes('pickaxe') ||
            item.name.includes('shovel')
        );
    }

    // If still no weapons found, return early
    if (weapons.length === 0) {
        return;
    }

    // Sort by attack damage in descending order (fixed the comparison operator)
    weapons.sort((a, b) => b.attackDamage - a.attackDamage);

    // Equip the strongest weapon
    const strongestWeapon = weapons[0];
    await bot.equip(strongestWeapon, 'hand');
}

