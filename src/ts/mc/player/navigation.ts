/**
 * Navigation and pathfinding utilities
 * @module mc/player/navigation
 */
import { Movements, goals } from 'mineflayer-pathfinder';
import type {Bot, FindBlockOptions} from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import {Block} from "prismarine-block";

export interface NavigationOptions {
    canDig?: boolean;
    allowPlace?: boolean;
    maxDistance?: number;
    timeout?: number;
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

    // Set movement options
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
 * Check if a torch should be placed at the current location
 */
export function shouldPlaceTorch(bot: Bot): boolean {
    const block = bot.blockAt(bot.entity.position);
    if (!block) return false;

    const blockOptions: FindBlockOptions = {
        matching: (block: Block) =>
            block.name === 'torch' || block.name === 'wall_torch',
        maxDistance: 6,
        count: 1
    };

    const hasTorchNearby = bot.findBlocks(blockOptions).length > 0;

    if (!hasTorchNearby) {
        const hasTorch = bot.inventory.items().some(item => item.name === 'torch');
        return Boolean(hasTorch && block.name === 'air');
    }

    return false;
}