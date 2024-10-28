import { Vec3 } from 'vec3';
import { goals, Movements } from 'mineflayer-pathfinder';
import { log, type ExtendedBot } from '../bot';

/**
 * Makes the bot till soil and optionally plant seeds
 */
export async function tillAndSow(
    bot: ExtendedBot,
    position: Vec3,
    seedType?: string
): Promise<boolean> {
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const z = Math.round(position.z);
    
    const block = bot.blockAt(new Vec3(x, y, z));
    if (!block) return false;

    if (block.name !== 'grass_block' && block.name !== 'dirt' && block.name !== 'farmland') {
        log(bot, `Cannot till ${block.name}, must be grass_block or dirt`);
        return false;
    }

    const above = bot.blockAt(new Vec3(x, y + 1, z));
    if (!above || above.name !== 'air') {
        log(bot, `Cannot till, there is ${above?.name} above the block`);
        return false;
    }

    // Move closer if needed
    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        bot.pathfinder.setMovements(new Movements(bot));
        await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 4));
    }

    // Till if not already farmland
    if (block.name !== 'farmland') {
        const hoe = bot.inventory.items().find(item => item.name.includes('hoe'));
        if (!hoe) {
            log(bot, 'Cannot till, no hoes');
            return false;
        }

        await bot.equip(hoe, 'hand');
        await bot.activateBlock(block);
        log(bot, `Tilled block at ${x}, ${y}, ${z}`);
    }

    // Plant seeds if specified
    if (seedType) {
        // Fix common mistake in seed names
        if (seedType.endsWith('seed') && !seedType.endsWith('seeds')) {
            seedType += 's';
        }

        const seeds = bot.inventory.items().find(item => item.name === seedType);
        if (!seeds) {
            log(bot, `No ${seedType} to plant`);
            return false;
        }

        await bot.equip(seeds, 'hand');
        await bot.placeBlock(block, new Vec3(0, 1, 0));
        log(bot, `Planted ${seedType} at ${x}, ${y}, ${z}`);
    }

    return true;
}