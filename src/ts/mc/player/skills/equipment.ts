import type { Item } from 'prismarine-item';
import { log, type ExtendedBot } from '../bot';

// Weapon damage values (based on Minecraft wiki)
const WEAPON_DAMAGE: Record<string, number> = {
    'netherite_sword': 8,
    'diamond_sword': 7,
    'iron_sword': 6,
    'stone_sword': 5,
    'wooden_sword': 4,
    'golden_sword': 4,
    'netherite_axe': 10,
    'diamond_axe': 9,
    'iron_axe': 9,
    'stone_axe': 9,
    'wooden_axe': 7,
    'golden_axe': 7,
    'diamond_pickaxe': 5,
    'iron_pickaxe': 4,
    'stone_pickaxe': 3,
    'wooden_pickaxe': 2,
    'golden_pickaxe': 2,
    'diamond_shovel': 5.5,
    'iron_shovel': 4.5,
    'stone_shovel': 3.5,
    'wooden_shovel': 2.5,
    'golden_shovel': 2.5
};

/**
 * Gets the attack damage for a weapon
 */
function getWeaponDamage(item: Item): number {
    return WEAPON_DAMAGE[item.name] || 1;
}

/**
 * Equips the highest damage weapon in the bot's inventory
 * Prioritizes swords and axes, falls back to pickaxes and shovels
 */
export async function equipBestWeapon(bot: ExtendedBot): Promise<void> {
    const weapons = bot.inventory.items().filter((item: Item) => 
        item.name.includes('sword') || 
        (item.name.includes('axe') && !item.name.includes('pickaxe'))
    );

    if (weapons.length === 0) {
        const tools = bot.inventory.items().filter((item: Item) => 
            item.name.includes('pickaxe') || 
            item.name.includes('shovel')
        );
        if (tools.length === 0) return;
        weapons.push(...tools);
    }

    weapons.sort((a, b) => getWeaponDamage(b) - getWeaponDamage(a));
    const weapon = weapons[0];
    
    if (weapon) {
        try {
            await bot.equip(weapon, 'hand');
            log(bot, `Equipped ${weapon.name}`);
        } catch (err) {
            log(bot, `Failed to equip weapon: ${(err as Error).message}`);
        }
    }
}

/**
 * Equips an item to the proper slot
 */
export async function equip(bot: ExtendedBot, itemName: string): Promise<boolean> {
    const item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
        log(bot, `No ${itemName} in inventory`);
        return false;
    }

    try {
        if (item.name.endsWith('helmet')) {
            await bot.equip(item, 'head');
        } else if (item.name.endsWith('chestplate')) {
            await bot.equip(item, 'torso');
        } else if (item.name.endsWith('leggings')) {
            await bot.equip(item, 'legs');
        } else if (item.name.endsWith('boots')) {
            await bot.equip(item, 'feet');
        } else {
            await bot.equip(item, 'hand');
        }
        log(bot, `Equipped ${itemName}`);
        return true;
    } catch (err) {
        log(bot, `Failed to equip ${itemName}: ${(err as Error).message}`);
        return false;
    }
}