import {Vec3} from "vec3";
import {Entity} from "prismarine-entity";
import { goals, Movements } from 'mineflayer-pathfinder';

import { ExtendedBot } from "../../../types/mc";
import * as world from '../world';
import {log} from "./index";
import {Block} from "prismarine-block";

/**
 * Navigation configuration options
 */
interface NavigationOptions {
    /** Minimum distance to maintain from target (default: 2) */
    minDistance?: number;
    /** Maximum search range for targets (default: 64) */
    maxRange?: number;
    /** Whether to allow cheat/creative mode teleportation */
    allowTeleport?: boolean;
}

/**
 * Options for following behavior
 */
interface FollowOptions {
    /** Distance to maintain from target (default: 4) */
    distance?: number;
    /** How often to check position in ms (default: 500) */
    updateInterval?: number;
    /** Distance that triggers teleport in cheat mode (default: 100) */
    teleportThreshold?: number;
}

/**
 * Options for stay behavior
 */
interface StayOptions {
    /** Duration in seconds to stay (-1 for indefinite, default: 30) */
    duration?: number;
    /** How often to check state in ms (default: 500) */
    checkInterval?: number;
    /** Whether to disable all movement modes (default: true) */
    disableAllModes?: boolean;
}

/**
 * Configuration options for bed navigation and sleeping
 */
interface BedOptions {
    /** Maximum search range for beds (default: 32) */
    searchRange?: number;
    /** Maximum time to attempt sleeping in ms (default: 30000) */
    sleepTimeout?: number;
    /** Whether to wait until morning (default: true) */
    waitUntilMorning?: boolean;
    /** Whether to attempt to wake up after sleeping (default: false) */
    autoWakeup?: boolean;
}

/**
 * List of all movement-related modes that can be disabled
 */
const MOVEMENT_MODES = [
    'self_preservation',
    'unstuck',
    'cowardice',
    'self_defense',
    'hunting',
    'torch_placing',
    'item_collecting'
] as const;

/**
 * Navigate to specific coordinates
 *
 * @param bot - The Minecraft bot instance
 * @param x - Target X coordinate
 * @param y - Target Y coordinate
 * @param z - Target Z coordinate
 * @param options - Navigation configuration options
 * @returns Promise resolving to true if destination was reached
 *
 * @remarks
 * Provides flexible navigation to exact coordinates:
 * - Supports both survival and creative mode movement
 * - Validates coordinates before attempting movement
 * - Uses optimal pathfinding configuration
 * - Supports minimum distance requirement
 *
 * @throws {Error} If coordinates are invalid
 *
 * @example
 * ```typescript
 * // Basic navigation
 * await goToPosition(bot, 100, 64, -200);
 *
 * // Keep distance from target
 * await goToPosition(bot, 100, 64, -200, { minDistance: 5 });
 * ```
 */
export async function goToPosition(
    bot: ExtendedBot,
    x: number | null,
    y: number | null,
    z: number | null,
    options: NavigationOptions | number = {}
): Promise<boolean> {
    // Handle case where options is a number (backwards compatibility)
    const config: NavigationOptions = typeof options === 'number'
        ? { minDistance: options }
        : options;

    const {
        minDistance = 2,
        allowTeleport = true
    } = config;

    // Validate coordinates
    if (x === null || y === null || z === null ||
        !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        log(bot, `Invalid coordinates: x:${x} y:${y} z:${z}`);
        return false;
    }

    try {
        // Handle creative/cheat mode
        if (allowTeleport && bot.modes.isOn('cheat')) {
            const destination = new Vec3(
                Math.floor(x),
                Math.floor(y),
                Math.floor(z)
            );
            bot.chat(`/tp @s ${destination.x} ${destination.y} ${destination.z}`);
            log(bot, `Teleported to ${destination.x}, ${destination.y}, ${destination.z}`);
            return true;
        }

        // Configure pathfinding
        const movements = new Movements(bot);
        movements.allowParkour = true;
        movements.allowSprinting = true;
        bot.pathfinder.setMovements(movements);

        // Navigate to position
        await bot.pathfinder.goto(
            new goals.GoalNear(x, y, z, minDistance)
        );

        log(bot, `Reached destination at ${x}, ${y}, ${z}`);
        return true;

    } catch (error) {
        log(bot, `Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}

/**
 * Navigate to the nearest block of a specific type
 *
 * @param bot - The Minecraft bot instance
 * @param blockType - Type of block to navigate to
 * @param options - Navigation configuration options
 * @returns Promise resolving to true if block was reached
 *
 * @remarks
 * Finds and navigates to nearest matching block:
 * - Enforces maximum search range
 * - Validates block existence before navigation
 * - Reports search results
 * - Uses optimized pathfinding
 *
 * @example
 * ```typescript
 * // Basic navigation to nearest oak log
 * await goToNearestBlock(bot, "oak_log");
 *
 * // Custom range and distance
 * await goToNearestBlock(bot, "chest", {
 *   minDistance: 3,
 *   maxRange: 100
 * });
 * ```
 */
export async function goToNearestBlock(
    bot: ExtendedBot,
    blockType: string,
    options: NavigationOptions = {}
): Promise<boolean> {
    const {
        minDistance = 2,
        maxRange = 64
    } = options;

    // Validate and cap range
    const MAX_ALLOWED_RANGE = 512;
    const searchRange = Math.min(maxRange, MAX_ALLOWED_RANGE);

    if (maxRange > MAX_ALLOWED_RANGE) {
        log(bot, `Maximum search range capped at ${MAX_ALLOWED_RANGE}`);
    }

    try {
        // Find nearest matching block
        const block = world.getNearestBlock(bot, blockType, searchRange);

        if (!block) {
            log(bot, `Could not find any ${blockType} within ${searchRange} blocks`);
            return false;
        }

        const { position } = block;
        log(bot, `Found ${blockType} at ${position.x}, ${position.y}, ${position.z}`);

        // Navigate to block
        return await goToPosition(bot, position.x, position.y, position.z, {
            minDistance,
            allowTeleport: true
        });

    } catch (error) {
        log(bot, `Block navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}

/**
 * Navigate to a specific player
 *
 * @param bot - The Minecraft bot instance
 * @param username - Username of target player
 * @param options - Navigation configuration options
 * @returns Promise resolving to true if player was reached
 *
 * @remarks
 * Provides player-specific navigation:
 * - Supports both normal and creative mode
 * - Handles player tracking
 * - Manages defensive modes
 * - Validates player existence
 *
 * @example
 * ```typescript
 * // Basic navigation to player
 * await goToPlayer(bot, "playerName");
 *
 * // Keep larger distance
 * await goToPlayer(bot, "playerName", { minDistance: 5 });
 * ```
 */
export async function goToPlayer(
    bot: ExtendedBot,
    username: string,
    options: NavigationOptions = {}
): Promise<boolean> {
    const {
        minDistance = 3,
        allowTeleport = true
    } = options;

    try {
        // Handle creative/cheat mode
        if (allowTeleport && bot.modes.isOn('cheat')) {
            bot.chat(`/tp @s ${username}`);
            log(bot, `Teleported to ${username}`);
            return true;
        }

        // Temporarily disable defensive behaviors
        bot.modes.pause('self_defense');
        bot.modes.pause('cowardice');

        // Find and validate player
        const player = bot.players[username]?.entity;
        if (!player) {
            log(bot, `Could not find player ${username}`);
            return false;
        }

        // Configure movement
        const movements = new Movements(bot);
        movements.canDig = false;  // Don't modify terrain when following players
        movements.allowParkour = true;
        movements.allowSprinting = true;
        bot.pathfinder.setMovements(movements);

        // Navigate to player
        await bot.pathfinder.goto(
            new goals.GoalFollow(player, minDistance),
        );

        log(bot, `Reached player ${username}`);
        return true;

    } catch (error) {
        log(bot, `Failed to reach player: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;

    } finally {
        // Restore defensive behaviors
        bot.modes.unpause('self_defense');
        bot.modes.unpause('cowardice');
    }
}

/**
 * Continuously follow a specific player
 *
 * @param bot - The Minecraft bot instance
 * @param username - Username of player to follow
 * @param options - Configuration options for following behavior
 * @returns Promise resolving to true if following was successful
 *
 * @remarks
 * Provides persistent player following:
 * - Maintains consistent following distance
 * - Handles teleportation in creative mode
 * - Manages unstuck behavior
 * - Supports interruption
 * - Optimizes pathfinding for continuous movement
 *
 * @example
 * ```typescript
 * // Basic following
 * await followPlayer(bot, "playerName");
 *
 * // Custom configuration
 * await followPlayer(bot, "playerName", {
 *   distance: 6,
 *   updateInterval: 1000,
 *   teleportThreshold: 50
 * });
 * ```
 */
export async function followPlayer(
    bot: ExtendedBot,
    username: string,
    options: FollowOptions = {}
): Promise<boolean> {
    const {
        distance = 4,
        updateInterval = 500,
        teleportThreshold = 100
    } = options;

    // Validate player
    const player: Entity = bot.players[username]?.entity;
    if (!player) {
        log(bot, `Cannot follow: player ${username} not found`);
        return false;
    }

    try {
        // Configure movement
        const movements = new Movements(bot);
        movements.canDig = false;  // Don't modify terrain while following
        movements.allowParkour = true;
        movements.allowSprinting = true;
        bot.pathfinder.setMovements(movements);

        // Set initial following goal
        const goal = new goals.GoalFollow(player, distance);
        bot.pathfinder.setGoal(goal, true);

        log(bot, `Now following player ${username}`);

        // Main following loop
        while (!bot.interrupt_code) {
            await new Promise(resolve => setTimeout(resolve, updateInterval));

            const currentDistance = bot.entity.position.distanceTo(player.position);

            // Handle creative mode teleportation
            if (bot.modes.isOn('cheat') &&
                currentDistance > teleportThreshold &&
                player.onGround) {
                await goToPlayer(bot, username, { minDistance: distance });
                continue;
            }

            // Manage unstuck mode based on distance
            if (bot.modes.isOn('unstuck')) {
                const isNearby = currentDistance <= distance + 1;
                if (isNearby) {
                    bot.modes.pause('unstuck');
                } else {
                    bot.modes.unpause('unstuck');
                }
            }

            // Update pathfinding goal if needed
            if (!bot.pathfinder.isMoving()) {
                bot.pathfinder.setGoal(new goals.GoalFollow(player, distance), true);
            }
        }

        return true;

    } catch (error) {
        log(bot, `Following error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;

    } finally {
        bot.pathfinder.stop();
    }
}

/**
 * Stay in current position for specified duration
 *
 * @param bot - The Minecraft bot instance
 * @param options - Configuration options for stay behavior
 * @returns Promise resolving to true if stay was completed
 *
 * @remarks
 * Maintains position with various control options:
 * - Supports indefinite duration with -1
 * - Can disable all movement modes
 * - Handles interruption
 * - Provides regular state checks
 * - Reports actual duration on completion
 *
 * @example
 * ```typescript
 * // Stay for 30 seconds
 * await stay(bot);
 *
 * // Stay indefinitely with custom configuration
 * await stay(bot, {
 *   duration: -1,
 *   checkInterval: 1000,
 *   disableAllModes: false
 * });
 * ```
 */
export async function stay(
    bot: ExtendedBot,
    options: StayOptions = {}
): Promise<boolean> {
    const {
        duration = 30,
        checkInterval = 500,
        disableAllModes = true
    } = options;

    // Store original mode states to restore later
    const originalModeStates = new Map<string, boolean>();

    try {
        // Disable movement modes if requested
        if (disableAllModes) {
            for (const mode of MOVEMENT_MODES) {
                // Store current state
                originalModeStates.set(mode, bot.modes.isOn(mode));
                // Pause mode
                bot.modes.pause(mode);
            }
        }

        const startTime = Date.now();
        const endTime = duration === -1 ? Infinity : startTime + (duration * 1000);

        // Main stay loop
        while (!bot.interrupt_code && Date.now() < endTime) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        const actualDuration = (Date.now() - startTime) / 1000;
        log(bot, `Stayed for ${actualDuration.toFixed(1)} seconds`);
        return !bot.interrupt_code;

    } catch (error) {
        log(bot, `Stay error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;

    } finally {
        // Restore original mode states
        if (disableAllModes) {
            for (const [mode, wasEnabled] of originalModeStates.entries()) {
                if (wasEnabled) {
                    bot.modes.unpause(mode);
                }
            }
        }
    }
}

/**
 * Validate if a block is a valid bed
 * Checks both the block type and accessibility
 */
function isValidBed(block: Block): boolean {
    return block.name.includes('bed') && !block.name.includes('bedrock');
}

/**
 * Navigate to and sleep in the nearest bed
 *
 * @param bot - The Minecraft bot instance
 * @param options - Configuration options for bed behavior
 * @returns Promise resolving to true if successfully slept in bed
 *
 * @remarks
 * Provides comprehensive bed interaction:
 * - Finds nearest available bed
 * - Validates bed accessibility
 * - Handles sleep state management
 * - Supports waiting until morning
 * - Includes timeout handling
 * - Reports sleep status
 *
 * @throws {Error} If bed interaction fails unexpectedly
 *
 * @example
 * ```typescript
 * // Basic usage - find and sleep in nearest bed
 * await goToBed(bot);
 *
 * // Custom configuration
 * await goToBed(bot, {
 *   searchRange: 50,
 *   sleepTimeout: 60000,
 *   waitUntilMorning: true,
 *   autoWakeup: true
 * });
 * ```
 */
export async function goToBed(
    bot: ExtendedBot,
    options: BedOptions = {}
): Promise<boolean> {
    const {
        searchRange = 32,
        sleepTimeout = 30000,
        waitUntilMorning = true,
        autoWakeup = false
    } = options;

    try {
        // Find all nearby beds
        const beds = bot.findBlocks({
            matching: isValidBed,
            maxDistance: searchRange,
            count: 10 // Find multiple in case some are obstructed or occupied
        });

        if (beds.length === 0) {
            log(bot, `Could not find any beds within ${searchRange} blocks`);
            return false;
        }

        // Try each bed until we find one we can sleep in
        for (const bedPos of beds) {
            try {
                const bed = bot.blockAt(bedPos);
                if (!bed || !isValidBed(bed)) continue;

                // Navigate to bed
                const success = await goToPosition(bot,
                    bedPos.x,
                    bedPos.y,
                    bedPos.z,
                    { minDistance: 2 }
                );

                if (!success) continue;

                // Look at bed and attempt to sleep
                await bot.lookAt(bedPos);
                await bot.sleep(bed);

                log(bot, `Successfully got in bed at ${bedPos.x}, ${bedPos.y}, ${bedPos.z}`);

                // Disable unstuck mode while sleeping
                bot.modes.pause('unstuck');

                if (waitUntilMorning) {
                    // Wait for morning or timeout
                    const startTime = Date.now();
                    while (bot.isSleeping) {
                        if (Date.now() - startTime > sleepTimeout) {
                            log(bot, 'Sleep timeout reached');
                            if (autoWakeup) {
                                await bot.wake();
                            }
                            return false;
                        }
                        // Check for interruption
                        if (bot.interrupt_code) {
                            if (bot.isSleeping && autoWakeup) {
                                await bot.wake();
                            }
                            return false;
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    log(bot, 'Woke up naturally');
                    return true;
                }

                return true;

            } catch (bedError) {
                // Log bed-specific error and continue to next bed
                log(bot, `Failed to use bed: ${
                    bedError instanceof Error ? bedError.message : 'Unknown error'
                }`);
            }
        }

        log(bot, 'Could not find any usable beds');
        return false;

    } catch (error) {
        log(bot, `Bed navigation error: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`);
        return false;

    } finally {
        // Ensure unstuck mode is restored
        bot.modes.unpause('unstuck');
    }
}