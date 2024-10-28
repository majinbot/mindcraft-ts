import type { Entity } from 'prismarine-entity';
import { type ExtendedBot, log } from '../bot';
import { equipBestWeapon } from './equipment';
import { isHostile, isHuntable } from '../../world/entities';
import { fleeFrom } from '../navigation';

/**
 * Makes the bot attack a target entity
 */
export async function attack(bot: ExtendedBot, target: Entity): Promise<void> {
    if (!target) return;

    try {
        // Equip best weapon
        await equipBestWeapon(bot);

        // Look at target and attack
        await bot.lookAt(target.position.offset(0, target.height, 0));
        bot.attack(target);

        log(bot, `Attacking ${target.name || 'entity'}`, true);
    } catch (err) {
        log(bot, `Failed to attack: ${(err as Error).message}`);
    }
}

/**
 * Makes the bot defend itself from nearby hostile entities
 */
export async function defend(bot: ExtendedBot): Promise<void> {
    const target = bot.nearestEntity(isHostile);
    if (!target) return;

    const health = bot.health ?? 0;
    if (health < 8) {
        await fleeFrom(bot, target, 16);
    } else {
        await attack(bot, target);
    }
}

/**
 * Makes the bot hunt nearby animals
 */
export async function hunt(bot: ExtendedBot): Promise<void> {
    const target = bot.nearestEntity(isHuntable);
    if (target) {
        await attack(bot, target);
    }
}

/**
 * Makes the bot flee from a target entity
 */
export async function flee(bot: ExtendedBot, target: Entity): Promise<void> {
    if (!target) return;
    await fleeFrom(bot, target, 10);
}