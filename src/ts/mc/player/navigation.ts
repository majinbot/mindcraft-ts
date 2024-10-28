import { Movements, goals } from 'mineflayer-pathfinder';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';
import { log, type ExtendedBot } from './bot';
import { autoLight } from './skills/torch';

export interface NavigationOptions {
    canDig?: boolean;
    allowPlace?: boolean;
    maxDistance?: number;
    timeout?: number;
}

/**
 * Makes the bot move to a specific position
 */
export async function goToPosition(
    bot: ExtendedBot,
    x: number,
    y: number,
    z: number,
    options: NavigationOptions = {}
): Promise<boolean> {
    try {
        const movements = new Movements(bot);
        movements.canDig = options.canDig ?? false;
        movements.allow1by1towers = options.allowPlace ?? false;
        
        bot.pathfinder.setMovements(movements);
        await bot.pathfinder.goto(new goals.GoalBlock(x, y, z));
        
        // Place torch if needed
        await autoLight(bot);
        
        return true;
    } catch (err) {
        log(bot, `Failed to reach position: ${(err as Error).message}`);
        return false;
    }
}

/**
 * Check if there is a clear path to the target
 */
export async function isClearPath(
    bot: Bot,
    target: Entity,
    options: NavigationOptions = {}
): Promise<boolean> {
    const movements = new Movements(bot);
    movements.canDig = options.canDig ?? false;
    movements.allow1by1towers = options.allowPlace ?? false;

    const goal = new goals.GoalNear(
        target.position.x,
        target.position.y,
        target.position.z,
        1
    );

    const path = bot.pathfinder.getPathTo(
        movements,
        goal,
        options.timeout ?? 100
    );

    return path.status === 'success';
}

/**
 * Makes the bot flee from hostile entities
 */
export async function fleeFrom(
    bot: ExtendedBot,
    target: Entity,
    distance = 10
): Promise<boolean> {
    if (!target) return false;

    try {
        // Calculate opposite direction
        const direction = bot.entity.position.minus(target.position).normalize();
        const destination = bot.entity.position.plus(direction.scaled(distance));

        // Move away
        const movements = new Movements(bot);
        bot.pathfinder.setMovements(movements);
        await bot.pathfinder.goto(new goals.GoalNear(
            destination.x,
            destination.y,
            destination.z,
            2
        ));
        
        log(bot, `Moved ${distance} blocks away from ${target.name || 'entity'}`);
        return true;
    } catch (err) {
        log(bot, `Failed to flee: ${(err as Error).message}`);
        return false;
    }
}

/**
 * Makes the bot use a door
 */
export async function useDoor(
    bot: ExtendedBot,
    doorPosition?: Vec3
): Promise<boolean> {
    try {
        // Find nearest door if position not specified
        if (!doorPosition) {
            const door = bot.findBlock({
                matching: block => block.name.includes('door'),
                maxDistance: 16
            });
            if (!door) {
                log(bot, 'No door found nearby');
                return false;
            }
            doorPosition = door.position;
        }

        // Move to door
        const movements = new Movements(bot);
        bot.pathfinder.setMovements(movements);
        await bot.pathfinder.goto(new goals.GoalNear(
            doorPosition.x,
            doorPosition.y,
            doorPosition.z,
            1
        ));

        // Use door
        const doorBlock = bot.blockAt(doorPosition);
        if (!doorBlock) return false;

        await bot.lookAt(doorPosition);
        await bot.activateBlock(doorBlock);
        
        // Walk through
        bot.setControlState('forward', true);
        await new Promise(resolve => setTimeout(resolve, 600));
        bot.setControlState('forward', false);
        
        // Close door behind
        await bot.activateBlock(doorBlock);
        
        log(bot, 'Used door');
        return true;
    } catch (err) {
        log(bot, `Failed to use door: ${(err as Error).message}`);
        return false;
    }
}

/**
 * Makes the bot stay in its current position
 */
export async function stay(
    bot: ExtendedBot,
    duration: number
): Promise<void> {
    bot.pathfinder.stop();
    await new Promise(resolve => setTimeout(resolve, duration));
}