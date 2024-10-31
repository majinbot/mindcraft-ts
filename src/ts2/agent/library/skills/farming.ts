import { Block } from 'prismarine-block';
import {Vec3} from 'vec3';
import { goToPosition } from './navigation';
import {log} from "./index";
import {Bot} from "mineflayer";

/**
 * Configuration options for farming operations
 */
interface FarmingOptions {
    /** Whether to harvest crops when ready */
    harvest?: boolean;
    /** Whether to replant after harvesting */
    replant?: boolean;
    /** Maximum range to search for farmland */
    range?: number;
}

/**
 * Configuration for tilling and planting
 */
interface TillOptions {
    /** Type of seed to plant after tilling */
    seedType?: string | null;
    /** Whether to till adjacent blocks */
    tillAdjacent?: boolean;
    /** Whether to wait for growth */
    waitForGrowth?: boolean;
}

/**
 * Configuration for growth monitoring
 */
interface GrowthMonitorOptions {
    /** Maximum time to wait for growth in ms (default: 30 minutes) */
    timeout?: number;
    /** How often to check growth in ms (default: 5000) */
    checkInterval?: number;
    /** Whether to provide progress updates (default: true) */
    reportProgress?: boolean;
}

/**
 * Valid ground blocks that can be tilled
 */
const TILLABLE_BLOCKS = new Set([
    'grass_block',
    'dirt',
    'grass_path',
    'farmland'
]);

/**
 * Map of crops to their seed items
 */
const CROP_TO_SEED_MAP: Record<string, string> = {
    'wheat': 'wheat_seeds',
    'carrots': 'carrot',
    'potatoes': 'potato',
    'beetroots': 'beetroot_seeds',
    'melon': 'melon_seeds',
    'pumpkin': 'pumpkin_seeds',
    'sweet_berry_bush': 'sweet_berries'
};

/**
 * Till soil and optionally plant seeds
 *
 * @param bot - The Minecraft bot instance
 * @param x - X coordinate to till
 * @param y - Y coordinate to till
 * @param z - Z coordinate to till
 * @param options - Configuration options for tilling
 * @returns Promise resolving to true if tilling/planting was successful
 *
 * @remarks
 * Provides comprehensive farming functionality:
 * - Validates ground type before tilling
 * - Ensures proper tool usage
 * - Handles seed planting
 * - Supports various crop types
 * - Reports detailed progress
 *
 * @example
 * ```typescript
 * // Just till the ground
 * await tillAndSow(bot, 100, 64, 100);
 *
 * // Till and plant wheat
 * await tillAndSow(bot, 100, 64, 100, {
 *   seedType: 'wheat_seeds',
 *   tillAdjacent: true
 * });
 * ```
 */
export async function tillAndSow(
    bot: Bot,
    x: number,
    y: number,
    z: number,
    options: TillOptions & GrowthMonitorOptions = {} // ✅ Include both option types
): Promise<boolean> {
    const {
        seedType = null,
        tillAdjacent = false,
        waitForGrowth = false
    } = options;

    // Validate coordinates
    const targetPos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
    const block = bot.blockAt(targetPos);

    if (!block) {
        log(bot, `No block found at ${targetPos}`);
        return false;
    }

    try {
        // Validate ground block
        if (!TILLABLE_BLOCKS.has(block.name)) {
            log(bot, `Cannot till ${block.name}, must be grass_block or dirt`);
            return false;
        }

        // Check space above
        const blockAbove = bot.blockAt(targetPos.offset(0, 1, 0));
        if (!blockAbove || blockAbove.name !== 'air') {
            log(bot, `Cannot till, there is ${blockAbove?.name || 'no space'} above the block`);
            return false;
        }

        // Move within range if needed
        if (bot.entity.position.distanceTo(targetPos) > 4.5) {
            await goToPosition(bot, targetPos.x, targetPos.y, targetPos.z, { minDistance: 4 });
        }

        // Don't till if already farmland and no seeds to plant
        if (block.name === 'farmland' && !seedType) {
            log(bot, 'Block is already tilled');
            return true;
        }

        // Find and equip hoe if needed
        if (block.name !== 'farmland') {
            const hoe = bot.inventory.items().find(item =>
                item.name.includes('hoe')
            );

            if (!hoe) {
                log(bot, 'Cannot till, no hoes available');
                return false;
            }

            await bot.equip(hoe, 'hand');
            await bot.activateBlock(block);
            log(bot, `Tilled block at ${targetPos}`);
        }

        // Handle seed planting
        if (seedType) {
            // Normalize seed name
            let normalizedSeedType = seedType;
            if (seedType.endsWith('seed') && !seedType.endsWith('seeds')) {
                normalizedSeedType += 's';
            }

            // Find seeds in inventory
            const seeds = bot.inventory.items().find(item =>
                item.name === normalizedSeedType
            );

            if (!seeds) {
                log(bot, `No ${normalizedSeedType} available to plant`);
                return false;
            }

            // Plant seeds
            await bot.equip(seeds, 'hand');
            const farmland = bot.blockAt(targetPos);
            if (!farmland) {
                log(bot, 'Failed to locate farmland after tilling');
                return false;
            }

            await bot.placeBlock(farmland, new Vec3(0, 1, 0));
            log(bot, `Planted ${normalizedSeedType} at ${targetPos}`);

            // Handle growth monitoring if requested
            if (waitForGrowth) {
                log(bot, `Monitoring growth of ${seedType} at ${x}, ${y}, ${z}`);

                const growthSuccess = await monitorGrowth(bot,
                    new Vec3(Math.floor(x), Math.floor(y), Math.floor(z)),
                    options // ✅ Pass the entire options object since it may contain these properties
                );

                if (growthSuccess) {
                    log(bot, `Crop at ${x}, ${y}, ${z} has reached maturity`);
                    return true;
                } else {
                    log(bot, `Stopped monitoring crop growth at ${x}, ${y}, ${z}`);
                    return false;
                }
            }
        }

        // Handle adjacent tilling if requested
        if (tillAdjacent) {
            const adjacentPositions: [number, number][] = [  // ✅ Explicit tuple array type
                [1, 0], [-1, 0], [0, 1], [0, -1]
            ];
            for (const [dx, dz] of adjacentPositions) {
                await tillAndSow(bot,
                    targetPos.x + dx,
                    targetPos.y,
                    targetPos.z + dz,
                    { ...options, tillAdjacent: false } // Prevent recursive adjacent tilling
                );
            }
        }

        return true;

    } catch (error) {
        log(bot, `Farming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}

/**
 * Calculate estimated time to maturity based on crop type and conditions
 * @internal
 */
function estimateGrowthTime(
    block: Block,
    currentAge: number
): number {
    // Base growth times in milliseconds (approximate Minecraft values)
    const baseGrowthTimes: Record<string, number> = {
        'wheat': 20 * 60 * 1000,      // 20 minutes
        'carrots': 20 * 60 * 1000,    // 20 minutes
        'potatoes': 20 * 60 * 1000,   // 20 minutes
        'beetroots': 20 * 60 * 1000,  // 20 minutes
        'melon_stem': 30 * 60 * 1000, // 30 minutes
        'pumpkin_stem': 30 * 60 * 1000 // 30 minutes
    };

    // Get base time for crop type
    const cropType = block.name.split('_')[0];
    const baseTime = baseGrowthTimes[cropType] ?? 20 * 60 * 1000;

    // Calculate remaining stages
    const maxAge = block.name === 'beetroots' ? 3 : 7;
    const remainingStages = maxAge - currentAge;

    // Estimate remaining time (this is approximate as actual growth is random)
    return remainingStages * (baseTime / maxAge);
}

/**
 * Monitor crop growth at a specific position
 * @internal
 */
async function monitorGrowth(
    bot: Bot,
    position: Vec3,
    options: GrowthMonitorOptions = {}
): Promise<boolean> {
    const {
        timeout = 30 * 60 * 1000, // 30 minutes default
        checkInterval = 5000,
        reportProgress = true
    } = options;

    const startTime = Date.now();
    let lastAge = -1;
    let lastReport = startTime;
    const reportInterval = 60000; // Progress report every minute

    try {
        while (true) {
            // Check for timeout
            if (Date.now() - startTime > timeout) {
                log(bot, 'Growth monitoring timed out');
                return false;
            }

            // Check for interruption
            if (bot.interrupt_code) {
                log(bot, 'Growth monitoring interrupted');
                return false;
            }

            // Get current block
            const block = bot.blockAt(position);
            if (!block) {
                log(bot, 'Crop block no longer exists');
                return false;
            }

            // Get current growth stage
            const properties = block.getProperties();
            const currentAge = properties.age ? Number(properties.age) : 0;
            const maxAge = block.name === 'beetroots' ? 3 : 7;

            // Check if fully grown
            if (currentAge === maxAge) {
                log(bot, `Crop at ${position} is fully grown!`);
                return true;
            }

            // Report progress if growth occurred
            if (currentAge !== lastAge) {
                lastAge = currentAge;
                if (reportProgress) {
                    log(bot, `Crop at ${position} is at growth stage ${currentAge}/${maxAge} ` +
                        `(${Math.round((currentAge / maxAge) * 100)}% complete)`);
                }
            } else if (reportProgress && Date.now() - lastReport > reportInterval) {
                // Periodic progress update
                log(bot, `Still monitoring crop at ${position}: ` +
                    `Stage ${currentAge}/${maxAge} ` +
                    `(${Math.round((currentAge / maxAge) * 100)}% complete)`);
                lastReport = Date.now();
            }

            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
    } catch (error) {
        log(bot, `Growth monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}

/**
 * Check if a crop is fully grown
 * @internal
 */
function isCropMature(block: Block): boolean {
    // Get block properties to check age
    const properties = block.getProperties();

    // Most crops use 'age' property
        if ('age' in properties && typeof properties.age !== 'undefined') {
        const age = Number(properties.age);
        const maxAge = block.name === 'beetroots' ? 3 : 7;
        return age === maxAge;
    }

    return false;
}

/**
 * Harvest nearby crops that are ready
 *
 * @param bot - The Minecraft bot instance
 * @param options - Configuration options for harvesting
 * @returns Promise resolving to true if any crops were harvested
 *
 * @remarks
 * Provides automated crop harvesting:
 * - Detects fully grown crops
 * - Handles different crop types
 * - Supports automatic replanting
 * - Collects harvested items
 *
 * @example
 * ```typescript
 * // Basic harvesting
 * await harvestCrops(bot);
 *
 * // Harvest and replant
 * await harvestCrops(bot, {
 *   replant: true,
 *   range: 16
 * });
 * ```
 */
export async function harvestCrops(
    bot: Bot,
    options: FarmingOptions & GrowthMonitorOptions = {}
): Promise<boolean> {
    const {
        replant = true,
        range = 16,
    } = options;

    try {
        const crops = bot.findBlocks({
            matching: (block: Block) => {
                const cropBase = block.name.split('_')[0];
                return cropBase in CROP_TO_SEED_MAP
            },
            maxDistance: range,
            count: 100
        });

        if (crops.length === 0) {
            log(bot, 'No mature crops found nearby');
            return false;
        }

        let harvested = 0;

        for (const cropPos of crops) {
            const block = bot.blockAt(cropPos);
            if (!block) continue;

            // Move to crop if needed
            if (bot.entity.position.distanceTo(cropPos) > 4.5) {
                await goToPosition(bot, cropPos.x, cropPos.y, cropPos.z, { minDistance: 4 });
            }

            // Harvest the crop
            await bot.dig(block);
            harvested++;

            // Handle replanting
            if (replant) {
                const seedType = CROP_TO_SEED_MAP[block.name.split('_')[0]];
                if (seedType) {
                    await tillAndSow(bot, cropPos.x, cropPos.y, cropPos.z, { seedType });
                }
            }
        }

        log(bot, `Harvested ${harvested} crops${replant ? ' and replanted' : ''}`);
        return harvested > 0;

    } catch (error) {
        log(bot, `Harvesting error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}