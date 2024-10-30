import {ExtendedBot, ExtendedItem} from "../../../types/mc";
import {log} from "./index";
import {getNearbyEntities, getNearestEntityWhere} from "../world";
import {Entity} from "prismarine-entity";
import {pickupNearbyItems} from "./blocks";
import {isHostile, RuntimeEntity} from "../../../utils/mcdata";
import {goals, Movements} from "mineflayer-pathfinder";
import {Vec3} from "vec3";
import {goToPosition} from "./navigation";

/**
 * Options for attacking entities
 */
interface AttackOptions {
    killTarget?: boolean;
    maxDistance?: number;
    fleeDistance?: number;
}

/**
 * Configuration options for enemy avoidance
 */
interface AvoidanceOptions {
    /** Distance to maintain from enemies (default: 16) */
    distance?: number;
    /** Whether to counterattack when cornered (default: true) */
    allowCounterAttack?: boolean;
    /** Maximum time to spend avoiding (in ms, default: 30000) */
    timeout?: number;
}

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

/**
 * Attack the nearest mob of the specified type
 *
 * @param bot - The Minecraft bot instance
 * @param mobType - The type of mob to attack (e.g., 'zombie', 'skeleton')
 * @param options - Configuration options for the attack
 * @returns Promise resolving to true if attack was successful
 *
 * @remarks
 * - Automatically disables cowardice mode while attacking
 * - Handles aquatic mobs by temporarily disabling self-preservation
 * - Includes built-in item collection after successful kills
 * - Supports configurable attack range and behavior
 *
 * @example
 * ```typescript
 * // Attack nearest zombie until killed
 * await attackNearest(bot, "zombie", { killTarget: true });
 *
 * // Attack skeleton once from safe distance
 * await attackNearest(bot, "skeleton", {
 *   killTarget: false,
 *   maxDistance: 16
 * });
 * ```
 */
export async function attackNearest(
    bot: ExtendedBot,
    mobType: string,
    options: AttackOptions = {}
): Promise<boolean> {
    const {
        killTarget = true,
        maxDistance = 24,
        fleeDistance = 16
    } = options;

    // Temporarily disable defensive behaviors
    bot.modes.pause('cowardice');

    // Special handling for aquatic mobs
    const aquaticMobs = ['drowned', 'cod', 'salmon', 'tropical_fish', 'squid'];
    if (aquaticMobs.includes(mobType)) {
        bot.modes.pause('self_preservation');
    }

    try {
        // Find nearest target
        const target = getNearbyEntities(bot, maxDistance)
            .find(entity => entity.name === mobType);

        if (!target) {
            log(bot, `Could not find any ${mobType} to attack.`);
            return false;
        }

        return await attackEntity(bot, target, {
            killTarget,
            fleeDistance
        });

    } finally {
        // Restore defensive behaviors
        bot.modes.unpause('cowardice');
        if (aquaticMobs.includes(mobType)) {
            bot.modes.unpause('self_preservation');
        }
    }
}

/**
 * Attack a specific entity
 *
 * @param bot - The Minecraft bot instance
 * @param entity - The target entity to attack
 * @param options - Attack configuration options
 * @returns Promise resolving to true if attack was successful
 *
 * @remarks
 * Handles both single attacks and sustained combat:
 * - For single attacks: Moves within range and performs one strike
 * - For sustained combat: Engages until target dies or combat is interrupted
 * - Automatically equips best weapon before attacking
 * - Collects dropped items after successful kills
 *
 * @throws {Error} If entity is invalid or unreachable
 *
 * @example
 * ```typescript
 * // Attack until target dies
 * const zombie = world.getNearestEntityWhere(bot, e => e.name === 'zombie');
 * if (zombie) {
 *   await attackEntity(bot, zombie, { killTarget: true });
 * }
 * ```
 */
export async function attackEntity(
    bot: ExtendedBot,
    entity: Entity,
    options: AttackOptions = {}
): Promise<boolean> {
    const {
        killTarget = true,
        maxDistance = 24,
        fleeDistance = 3
    } = options;

    if (!entity || !entity.position) {
        throw new Error('Invalid target entity');
    }

    // Prepare for combat
    await equipHighestAttack(bot);

    try {
        if (!killTarget) {
            // Single attack mode
            if (bot.entity.position.distanceTo(entity.position) > maxDistance) {
                await goToPosition(bot,
                    entity.position.x,
                    entity.position.y,
                    entity.position.z,
                    fleeDistance
                );
            }
            bot.attack(entity);
            return true;
        }

        // Sustained combat mode
        await bot.pvp.attack(entity);

        // Wait for target death or interruption
        while (getNearbyEntities(bot, maxDistance).includes(entity)) {
            await new Promise(resolve => setTimeout(resolve, 250));

            // Check for interruption
            if (bot.interrupt_code) {
                await bot.pvp.stop();
                return false;
            }

            // Maintain safe distance if needed
            if (bot.entity.position.distanceTo(entity.position) < fleeDistance) {
                await moveAway(bot, fleeDistance);
            }
        }

        log(bot, `Successfully killed ${entity.name}.`);
        await pickupNearbyItems(bot);
        return true;

    } catch (error) {
        log(bot, `Combat error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}

/**
 * Defend against nearby hostile mobs
 *
 * @param bot - The Minecraft bot instance
 * @param options - Defense configuration options
 * @returns Promise resolving to true if any enemies were defeated
 *
 * @remarks
 * Provides active defense against hostile mobs:
 * - Maintains tactical distance from enemies
 * - Uses optimal weapons automatically
 * - Handles multiple attackers efficiently
 * - Supports customizable range and behavior
 *
 * @example
 * ```typescript
 * // Defend against enemies within 12 blocks
 * await defendSelf(bot, { range: 12 });
 * ```
 */
export async function defendSelf(
    bot: ExtendedBot,
    options: { range?: number; fleeDistance?: number } = {}
): Promise<boolean> {
    const {
        range = 9,
        fleeDistance = 4
    } = options;

    // Disable defensive modes during active defense
    bot.modes.pause('self_defense');
    bot.modes.pause('cowardice');

    try {
        let attacked = false;
        let enemy = getNearestEntityWhere(
            bot,
            entity => isHostile(entity as RuntimeEntity),
            range
        );

        while (enemy) {
            await equipHighestAttack(bot);

            // Special handling for dangerous mobs
            const isDangerousMob = ['creeper', 'phantom'].includes(enemy.name!);
            const targetDistance = isDangerousMob ? fleeDistance * 2 : fleeDistance;

            // Maintain tactical distance
            const currentDistance = bot.entity.position.distanceTo(enemy.position);

            if (currentDistance >= targetDistance && !isDangerousMob) {
                // Move closer if too far
                try {
                    const movements = new Movements(bot);
                    bot.pathfinder.setMovements(movements);
                    await bot.pathfinder.goto(
                        new goals.GoalFollow(enemy, targetDistance - 0.5)
                    );
                } catch {
                    // Ignore pathfinding errors - entity might die during movement
                }
            } else if (currentDistance <= targetDistance) {
                // Back away if too close
                try {
                    const movements = new Movements(bot);
                    bot.pathfinder.setMovements(movements);
                    const invertedGoal = new goals.GoalInvert(
                        new goals.GoalFollow(enemy, targetDistance)
                    );
                    await bot.pathfinder.goto(invertedGoal);
                } catch {
                    // Ignore pathfinding errors
                }
            }

            // Engage enemy
            await bot.pvp.attack(enemy);
            attacked = true;

            // Check for combat status
            await new Promise(resolve => setTimeout(resolve, 250));

            if (bot.interrupt_code) {
                await bot.pvp.stop();
                return false;
            }

            // Look for next target
            enemy = getNearestEntityWhere(
                bot,
                entity => isHostile(entity as RuntimeEntity),
                range
            );
        }

        await bot.pvp.stop();
        log(bot, attacked ?
            'Successfully defended self.' :
            'No enemies nearby to defend against.'
        );

        return attacked;

    } finally {
        // Restore defensive modes
        bot.modes.unpause('self_defense');
        bot.modes.unpause('cowardice');
    }
}

/**
 * Move away from the current position
 *
 * @param bot - The Minecraft bot instance
 * @param distance - Minimum distance to move
 * @returns Promise resolving to true when movement is complete
 *
 * @remarks
 * Provides tactical repositioning:
 * - Finds safest available retreat direction
 * - Uses pathfinding to avoid obstacles
 * - Supports both survival and creative mode movement
 *
 * @example
 * ```typescript
 * // Retreat 8 blocks from current position
 * await moveAway(bot, 8);
 * ```
 */
export async function moveAway(
    bot: ExtendedBot,
    distance: number
): Promise<boolean> {
    const currentPos = bot.entity.position;
    const goal = new goals.GoalNear(
        currentPos.x,
        currentPos.y,
        currentPos.z,
        distance
    );
    const invertedGoal = new goals.GoalInvert(goal);

    // Configure movement restrictions
    const movements = new Movements(bot);
    movements.canDig = false;
    movements.allow1by1towers = false;
    bot.pathfinder.setMovements(movements);

    try {
        // Handle creative mode movement
        if (bot.modes.isOn('cheat')) {
            const path = bot.pathfinder.getPathTo(movements, invertedGoal, 10000);
            const lastMove = path.path[path.path.length - 1];

            if (lastMove) {
                const destination = new Vec3(
                    Math.floor(lastMove.x),
                    Math.floor(lastMove.y),
                    Math.floor(lastMove.z)
                );
                bot.chat(`/tp @s ${destination.x} ${destination.y} ${destination.z}`);
                return true;
            }
        }

        // Handle survival mode movement
        await bot.pathfinder.goto(invertedGoal);
        const newPos = bot.entity.position;
        log(bot, `Moved away from previous position to ${newPos.x}, ${newPos.y}, ${newPos.z}`);

        return true;

    } catch (error) {
        log(bot, `Failed to move away: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}

/**
 * Move away from all nearby hostile mobs
 *
 * @param bot - The Minecraft bot instance
 * @param options - Configuration options for avoidance behavior
 * @returns Promise resolving to true if avoidance was successful
 *
 * @remarks
 * Provides sophisticated enemy avoidance:
 * - Maintains safe distance from all hostile mobs
 * - Uses pathfinding to find optimal escape routes
 * - Can perform defensive attacks if cornered
 * - Supports timeout to prevent infinite fleeing
 * - Temporarily disables conflicting movement modes
 *
 * @throws {Error} If pathfinding fails catastrophically
 *
 * @example
 * ```typescript
 * // Basic avoidance
 * await avoidEnemies(bot);
 *
 * // Configured avoidance
 * await avoidEnemies(bot, {
 *   distance: 20,
 *   allowCounterAttack: false,
 *   timeout: 15000
 * });
 * ```
 */
export async function avoidEnemies(
    bot: ExtendedBot,
    options: AvoidanceOptions = {}
): Promise<boolean> {
    const {
        distance = 16,
        allowCounterAttack = true,
        timeout = 30000
    } = options;

    // Track start time for timeout
    const startTime = Date.now();

    // Temporarily disable preservation mode to allow tactical movement
    bot.modes.pause('self_preservation');

    try {
        let enemy = getNearestEntityWhere(
            bot,
            entity => isHostile(entity as RuntimeEntity),
            distance
        );

        while (enemy) {
            // Check timeout
            if (Date.now() - startTime > timeout) {
                log(bot, `Avoidance timeout reached after ${timeout}ms`);
                return false;
            }

            // Check for interruption
            if (bot.interrupt_code) {
                return false;
            }

            const currentDistance = bot.entity.position.distanceTo(enemy.position);

            // Handle being cornered
            if (allowCounterAttack && currentDistance < 3) {
                log(bot, `Cornered by ${enemy.name}, initiating defensive attack`);
                await attackEntity(bot, enemy, { killTarget: false });
                // Continue avoiding after attack
            }

            try {
                // Configure movements for evasion
                const movements = new Movements(bot);
                movements.canDig = false;  // Don't dig while fleeing
                movements.allowParkour = true;  // Allow parkour for better escape
                movements.allowSprinting = true;  // Enable sprinting
                bot.pathfinder.setMovements(movements);

                // Create inverted goal to move away from enemy
                const followGoal = new goals.GoalFollow(enemy, distance);
                const avoidanceGoal = new goals.GoalInvert(followGoal);

                // Set pathfinding goal with a short timeout
                bot.pathfinder.setGoal(avoidanceGoal, true);

                // Wait a bit before checking status again
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                // Log pathfinding errors but continue avoidance
                log(bot, `Pathfinding error during avoidance: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`);

                // If pathfinding fails, try simple movement away
                await moveAway(bot, distance / 2);
            }

            // Look for next threat
            enemy = getNearestEntityWhere(
                bot,
                entity => isHostile(entity as RuntimeEntity),
                distance
            );
        }

        bot.pathfinder.stop();
        log(bot, `Successfully moved ${distance} blocks away from enemies`);
        return true;

    } catch (error) {
        log(bot, `Enemy avoidance failed: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
        return false;

    } finally {
        // Restore preservation mode
        bot.modes.unpause('self_preservation');
        bot.pathfinder.stop();
    }
}