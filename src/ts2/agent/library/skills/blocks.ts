import {
    DIRECTION_VECTORS,
    ExtendedBot, ORE_BLOCKS,
    PlacementSide,
    REPLACEABLE_BLOCKS,
    STATIONARY_PLACEMENT_BLOCKS, UNBREAKABLE_BLOCKS
} from "../../../types/mc";
import {getBlockId, makeItem} from "../../../utils/mcdata";
import {Vec3} from "vec3";
import {Block} from "prismarine-block";
import pf, {goals, Movements, SafeBlock} from "mineflayer-pathfinder";
import type { Entity } from 'prismarine-entity';
import {log} from "./index";
import {getNearestBlock, getNearestBlocks} from "../world";
import {autoLight} from "./torch";

/**
 * Collection error types
 */
interface CollectionError extends Error {
    name: 'NoChests' | string;
}

/**
 * Places a block at the specified coordinates
 * @param bot - The Minecraft bot instance
 * @param blockType - Type of block to place (e.g., 'stone', 'dirt')
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @param placeOn - Side to place block against
 * @param dontCheat - Override cheat mode to place normally
 * @returns Promise resolving to true if placement successful
 *
 * @remarks
 * This function handles both creative and survival placement mechanics:
 * - In creative/cheat mode, uses /setblock commands
 * - In survival, finds suitable placement surface and manages positioning
 * - Handles special blocks like torches, doors, and redstone components
 * - Accounts for block-specific placement rules and orientations
 *
 * @example
 * ```typescript
 * // Place a torch on a wall
 * await placeBlock(bot, "torch", 100, 65, 200, "north");
 *
 * // Place a chest on the ground
 * await placeBlock(bot, "chest", 100, 64, 200, "bottom");
 * ```
 */
export async function placeBlock(
    bot: ExtendedBot,
    blockType: string,
    x: number,
    y: number,
    z: number,
    placeOn: PlacementSide = 'bottom',
    dontCheat = false
): Promise<boolean> {
    // Validate block type
    if (!getBlockId(blockType)) {
        log(bot, `Invalid block type: ${blockType}`);
        return false;
    }

    const targetPos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));

    // Handle creative/cheat mode placement
    if (bot.modes.isOn('cheat') && !dontCheat) {
        return await handleCreativePlacement(bot, blockType, targetPos, placeOn);
    }

    // Handle survival mode placement
    return await handleSurvivalPlacement(bot, blockType, targetPos, placeOn);
}

/**
 * Handles block placement in creative/cheat mode
 * @internal
 */
async function handleCreativePlacement(
    bot: ExtendedBot,
    blockType: string,
    targetPos: Vec3,
    placeOn: PlacementSide
): Promise<boolean> {
    // Convert facing direction for special blocks
    const face = placeOn === 'north' ? 'south'
        : placeOn === 'south' ? 'north'
            : placeOn === 'east' ? 'west'
                : placeOn === 'west' ? 'east'
                    : placeOn;

    let modifiedType = blockType;

    // Handle special block types
    if (blockType.includes('torch') && placeOn !== 'bottom') {
        modifiedType = handleTorchPlacement(blockType, placeOn, face);
    } else if (blockType.includes('button') || blockType === 'lever') {
        modifiedType = handleButtonLeverPlacement(blockType, placeOn, face);
    } else if (['ladder', 'repeater', 'comparator'].includes(blockType)) {
        modifiedType += `[facing=${face}]`;
    }

    // Execute setblock command
    const command = `/setblock ${targetPos.x} ${targetPos.y} ${targetPos.z} ${modifiedType}`;
    bot.chat(command);

    // Handle multi-block structures
    if (blockType.includes('door')) {
        bot.chat(`/setblock ${targetPos.x} ${targetPos.y + 1} ${targetPos.z} ${modifiedType}[half=upper]`);
    } else if (blockType.includes('bed')) {
        bot.chat(`/setblock ${targetPos.x} ${targetPos.y} ${targetPos.z - 1} ${modifiedType}[part=head]`);
    }

    log(bot, `Used /setblock to place ${modifiedType} at ${targetPos}`);
    return true;
}


/**
 * Handles block placement in survival mode
 * @internal
 */
async function handleSurvivalPlacement(
    bot: ExtendedBot,
    blockType: string,
    targetPos: Vec3,
    placeOn: PlacementSide
): Promise<boolean> {
    // Handle redstone wire special case
    const inventoryType = blockType === 'redstone_wire' ? 'redstone' : blockType;

    // Find item in inventory
    let block = bot.inventory.items().find(item => item.name === inventoryType);
    if (!block && bot.game.gameMode === 'creative') {
        // Create the item instance first
        const itemToAdd = makeItem(inventoryType, 1);
        await bot.creative.setInventorySlot(36, itemToAdd);
        block = bot.inventory.items().find(item => item.name === inventoryType);
    }

    if (!block) {
        log(bot, `Don't have any ${blockType} to place`);
        return false;
    }

    // Check target location
    const targetBlock = bot.blockAt(targetPos);
    if (!targetBlock) return false;

    if (targetBlock.name === blockType) {
        log(bot, `${blockType} already at ${targetPos}`);
        return false;
    }

    // Handle block removal if needed
    if (!REPLACEABLE_BLOCKS.has(targetBlock.name)) {
        if (!await handleBlockRemoval(bot, targetBlock, targetPos)) {
            return false;
        }
    }

    // Find surface to place against
    const { buildOffBlock, faceVec } = await findPlacementSurface(
        bot,
        targetPos,
        placeOn
    );

    if (!buildOffBlock || !faceVec) {
        log(bot, `Cannot place ${blockType} at ${targetPos}: nothing to place on`);
        return false;
    }

    // Position bot appropriately
    if (!await positionForPlacement(
        bot,
        targetBlock,
        blockType,
        targetPos
    )) {
        return false;
    }

    // Attempt placement
    try {
        await bot.equip(block, 'hand');
        await bot.lookAt(buildOffBlock.position);
        await bot.placeBlock(buildOffBlock, faceVec);

        log(bot, `Placed ${blockType} at ${targetPos}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
    } catch (err) {
        log(bot, `Failed to place ${blockType} at ${targetPos}`);
        return false;
    }
}

/**
 * Handles special placement rules for torch blocks
 * @param blockType - Original block type
 * @param placeOn - Placement side
 * @param face - Converted face direction
 * @returns Modified block type string with appropriate facing
 * @internal
 */
function handleTorchPlacement(
    blockType: string,
    placeOn: PlacementSide,
    face: string
): string {
    // Convert to wall torch when not placed on ground
    let modifiedType = blockType.replace('torch', 'wall_torch');

    // Add facing property if not placing on side or top
    if (placeOn !== 'side' && placeOn !== 'top') {
        modifiedType += `[facing=${face}]`;
    }

    return modifiedType;
}

/**
 * Handles special placement rules for buttons and levers
 * @param blockType - Original block type
 * @param placeOn - Placement side
 * @param face - Converted face direction
 * @returns Modified block type string with appropriate facing
 * @internal
 */
function handleButtonLeverPlacement(
    blockType: string,
    placeOn: PlacementSide,
    face: string
): string {
    if (placeOn === 'top') {
        return `${blockType}[face=ceiling]`;
    }
    if (placeOn === 'bottom') {
        return `${blockType}[face=floor]`;
    }
    return `${blockType}[facing=${face}]`;
}

/**
 * Handles removal of existing blocks at target location
 * @param bot - Bot instance
 * @param targetBlock - Block to remove
 * @param targetPos - Position of block
 * @returns Promise resolving to true if removal successful
 * @internal
 */
async function handleBlockRemoval(
    bot: ExtendedBot,
    targetBlock: Block,
    targetPos: Vec3
): Promise<boolean> {
    log(bot, `${targetBlock.name} in the way at ${targetPos}`);
    const removed = await breakBlockAt(bot, targetPos.x, targetPos.y, targetPos.z);

    if (!removed) {
        log(bot, `Cannot place block at ${targetPos}: block in the way`);
        return false;
    }

    // Wait for block breaking animation to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    return true;
}

/**
 * Finds appropriate surface for block placement
 * @param bot - Bot instance
 * @param targetPos - Target position for new block
 * @param placeOn - Preferred placement side
 * @returns Object containing reference block and face vector for placement
 * @internal
 */
async function findPlacementSurface(
    bot: ExtendedBot,
    targetPos: Vec3,
    placeOn: PlacementSide
): Promise<{ buildOffBlock: Block | null; faceVec: Vec3 | null }> {
    const dirs: Vec3[] = [];

    // Determine placement direction priorities
    if (placeOn === 'side') {
        // Try horizontal directions first for side placement
        dirs.push(
            DIRECTION_VECTORS.north,
            DIRECTION_VECTORS.south,
            DIRECTION_VECTORS.east,
            DIRECTION_VECTORS.west
        );
    } else if (placeOn in DIRECTION_VECTORS) {
        // Try preferred direction first
        dirs.push(DIRECTION_VECTORS[placeOn as keyof typeof DIRECTION_VECTORS]);
    } else {
        // Default to bottom placement
        dirs.push(DIRECTION_VECTORS.bottom);
        log(bot, `Unknown placeOn value "${placeOn}". Defaulting to bottom.`);
    }

    // Add remaining directions as fallbacks
    dirs.push(...Object.values(DIRECTION_VECTORS).filter(d =>
        !dirs.some(existing => existing.equals(d))
    ));

    // Find first valid placement surface
    for (const dir of dirs) {
        const checkPos = targetPos.plus(dir);
        const block = bot.blockAt(checkPos);

        if (block && !REPLACEABLE_BLOCKS.has(block.name)) {
            return {
                buildOffBlock: block,
                faceVec: new Vec3(-dir.x, -dir.y, -dir.z) // Invert direction
            };
        }
    }

    return { buildOffBlock: null, faceVec: null };
}

/**
 * Positions bot appropriately for block placement
 * @param bot - Bot instance
 * @param targetBlock - Block being placed
 * @param blockType - Type of block being placed
 * @param targetPos - Target position
 * @returns Promise resolving to true if positioning successful
 * @internal
 */
async function positionForPlacement(
    bot: ExtendedBot,
    targetBlock: Block,
    blockType: string,
    targetPos: Vec3
): Promise<boolean> {
    const botPos = bot.entity.position;
    const botPosAbove = botPos.plus(new Vec3(0, 1, 0));

    // Check if bot needs to move away from placement location
    if (!STATIONARY_PLACEMENT_BLOCKS.has(blockType) &&
        (botPos.distanceTo(targetPos) < 1 || botPosAbove.distanceTo(targetPos) < 1)) {
        // Move away from placement location
        const goal = new pf.goals.GoalNear(
            targetBlock.position.x,
            targetBlock.position.y,
            targetBlock.position.z,
            2
        );
        const invertedGoal = new pf.goals.GoalInvert(goal);

        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(invertedGoal);
    }

    // Move closer if too far
    if (bot.entity.position.distanceTo(targetPos) > 4.5) {
        const movements = new pf.Movements(bot);
        bot.pathfinder.setMovements(movements);
        await bot.pathfinder.goto(new pf.goals.GoalNear(
            targetPos.x,
            targetPos.y,
            targetPos.z,
            4
        ));
    }

    return true;
}

/**
 * Calculates the distance between two positions
 * @param pos1 - First position
 * @param pos2 - Second position
 * @returns Distance between positions
 * @internal
 */
function distanceBetween(pos1: Vec3, pos2: Vec3): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Breaks a block at the specified coordinates
 * @param bot - The Minecraft bot instance
 * @param x - X coordinate of the block to break
 * @param y - Y coordinate of the block to break
 * @param z - Z coordinate of the block to break
 * @returns Promise resolving to true if block was broken
 *
 * @remarks
 * This function handles block breaking in both creative and survival modes:
 * - In creative/cheat mode, uses /setblock command
 * - In survival, ensures proper tool equipment and block reachability
 * - Handles pathfinding to reach blocks that are too far away
 * - Verifies tool capabilities for breaking specific block types
 *
 * @throws {Error} If any coordinate is null/undefined
 *
 * @example
 * ```typescript
 * // Break block below the bot
 * const pos = world.getPosition(bot);
 * await breakBlockAt(bot, pos.x, pos.y - 1, pos.z);
 *
 * // Break specific block
 * await breakBlockAt(bot, 100, 64, 100);
 * ```
 */
export async function breakBlockAt(
    bot: ExtendedBot,
    x: number,
    y: number,
    z: number
): Promise<boolean> {
    // Validate coordinates
    if (x == null || y == null || z == null) {
        throw new Error(
            `Invalid position to break block at: x=${x}, y=${y}, z=${z}`
        );
    }

    // Get block at position
    const targetPos = new Vec3(x, y, z);
    const block = bot.blockAt(targetPos);

    if (!block) {
        log(bot, `No block found at ${targetPos}`);
        return false;
    }

    // Skip if block is unbreakable
    if (UNBREAKABLE_BLOCKS.has(block.name)) {
        log(bot, `Skipping block at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)} because it is ${block.name}`);
        return false;
    }

    // Handle creative/cheat mode
    if (bot.modes.isOn('cheat')) {
        return await handleCreativeBreak(bot, targetPos);
    }

    // Handle survival mode
    return await handleSurvivalBreak(bot, block);
}

/**
 * Handles block breaking in creative/cheat mode
 * @internal
 */
async function handleCreativeBreak(
    bot: ExtendedBot,
    pos: Vec3
): Promise<boolean> {
    const command = `/setblock ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} air`;
    bot.chat(command);
    log(bot, `Used /setblock to break block at ${pos}`);
    return true;
}

/**
 * Handles block breaking in survival mode
 * @internal
 */
async function handleSurvivalBreak(
    bot: ExtendedBot,
    block: Block
): Promise<boolean> {
    // Move within range if needed
    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        try {
            await moveToBlock(bot, block);
        } catch (err) {
            log(bot, `Failed to reach block: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return false;
        }
    }

    // Handle tool requirements in survival mode
    if (bot.game.gameMode !== 'creative') {
        if (!await equipProperTool(bot, block)) {
            return false;
        }
    }

    // Break the block
    try {
        await bot.dig(block, true);
        log(bot, `Broke ${block.name} at x:${block.position.x.toFixed(1)}, y:${block.position.y.toFixed(1)}, z:${block.position.z.toFixed(1)}`);
        return true;
    } catch (err) {
        log(bot, `Failed to break ${block.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return false;
    }
}

/**
 * Moves the bot within range of a block
 * @internal
 */
async function moveToBlock(bot: ExtendedBot, block: Block): Promise<void> {
    const movements = new Movements(bot);

    // Configure movement restrictions for safe navigation
    movements.allowFreeMotion = false;
    movements.allow1by1towers = false;
    movements.canDig = false;      // Don't want to dig while approaching
    movements.allowParkour = false; // Play it safe when approaching blocks

    bot.pathfinder.setMovements(movements);
    await bot.pathfinder.goto(
        new goals.GoalNear(
            block.position.x,
            block.position.y,
            block.position.z,
            4
        )
    );
}

/**
 * Equips the proper tool for breaking a block
 * @internal
 */
async function equipProperTool(bot: ExtendedBot, block: Block): Promise<boolean> {
    await bot.tool.equipForBlock(block);
    const itemId = bot.heldItem?.type ?? null;

    if (!block.canHarvest(itemId)) {
        log(bot, `Don't have right tools to break ${block.name}`);
        return false;
    }

    return true;
}

/**
 * Gets all valid block types to collect for a given base type
 * @internal
 */
function getValidBlockTypes(blockType: string): string[] {
    const types = [blockType];

    if (ORE_BLOCKS.has(blockType)) {
        types.push(`${blockType}_ore`);
    }
    if (blockType.endsWith('ore')) {
        types.push(`deepslate_${blockType}`);
    }
    if (blockType === 'dirt') {
        types.push('grass_block');
    }

    return types;
}

/**
 * Collects specified blocks from the world
 * @param bot - The Minecraft bot instance
 * @param blockType - Type of block to collect
 * @param num - Number of blocks to collect (default: 1)
 * @param exclude - Optional positions to exclude from collection
 * @returns Promise resolving to true if any blocks were collected
 *
 * @remarks
 * - Handles ore variants automatically (e.g., iron -> iron_ore)
 * - Supports deepslate variants for ores
 * - Verifies tool compatibility before collection
 * - Handles inventory full conditions
 *
 * @example
 * ```typescript
 * // Collect some wood
 * await collectBlock(bot, "oak_log", 5);
 *
 * // Collect iron, including both normal and deepslate variants
 * await collectBlock(bot, "iron");
 * ```
 *
 * @throws {Error} If num is less than 1
 */
export async function collectBlock(
    bot: ExtendedBot,
    blockType: string,
    num: number = 1,
    exclude: Vec3[] | null = null
): Promise<boolean> {
    if (num < 1) {
        log(bot, `Invalid number of blocks to collect: ${num}`);
        return false;
    }

    const blockTypes = getValidBlockTypes(blockType);
    let collected = 0;

    for (let i = 0; i < num; i++) {
        try {
            const success = await collectSingleBlock(bot, blockTypes, blockType, exclude);
            if (!success) break;
            collected++;

            if (bot.interrupt_code) break;
        } catch (err) {
            if (isCollectionError(err) && err.name === 'NoChests') {
                log(bot, `Failed to collect ${blockType}: Inventory full, no place to deposit`);
                break;
            }
            log(bot, `Failed to collect ${blockType}: ${err instanceof Error ? err.message : 'Unknown error'}`);

        }
    }

    log(bot, `Collected ${collected} ${blockType}`);
    return collected > 0;
}

/**
 * Converts a Block to a SafeBlock by adding required properties
 * @internal
 */
function toSafeBlock(block: Block): SafeBlock {
    return {
        ...block,
        safe: true, // These values should be properly calculated
        physical: true, // based on block properties
        liquid: ['water', 'lava'].includes(block.name),
        height: 1,
        replaceable: false,
        climbable: block.name === 'ladder' || block.name === 'vine',
        openable: ['door', 'trapdoor', 'gate'].some(type => block.name.includes(type))
    } as SafeBlock;
}

async function collectSingleBlock(
    bot: ExtendedBot,
    blockTypes: string[],
    originalType: string,
    exclude: Vec3[] | null
): Promise<boolean> {
    // Use proper options object
    let blocks = getNearestBlocks(bot, blockTypes, {
        distance: 64,
        count: 10000
    });

    // Filter excluded positions
    if (exclude) {
        blocks = blocks.filter(block =>
            !exclude.some(pos =>
                pos.x === block.position.x &&
                pos.y === block.position.y &&
                pos.z === block.position.z
            )
        );
    }

    // Convert blocks to SafeBlocks for movement checks
    const movements = new Movements(bot);
    movements.dontMineUnderFallingBlock = false;
    blocks = blocks
        .map(toSafeBlock)
        .filter(block => movements.safeToBreak(block));

    if (blocks.length === 0) {
        log(bot, `No ${originalType} nearby to collect`);
        return false;
    }

    const block = blocks[0];
    await equipToolForBlock(bot, block, originalType);

    await bot.collectBlock.collect(block);
    await autoLight(bot);

    return true;
}

/**
 * Equips appropriate tool for breaking a block
 * @internal
 */
async function equipToolForBlock(
    bot: ExtendedBot,
    block: Block,
    blockType: string
): Promise<void> {
    await bot.tool.equipForBlock(block);
    const itemId = bot.heldItem?.type ?? null;

    if (!block.canHarvest(itemId)) {
        throw new Error(`Don't have right tools to harvest ${blockType}`);
    }
}

/**
 * Type guard for collection errors
 * @internal
 */
function isCollectionError(error: unknown): error is CollectionError {
    return error instanceof Error && 'name' in error;
}

/**
 * Picks up all nearby dropped items
 * @param bot - The Minecraft bot instance
 * @returns Promise resolving to true when complete
 *
 * @remarks
 * Continues until no more items are in range or an item can't be reached
 *
 * @example
 * ```typescript
 * await pickupNearbyItems(bot);
 * ```
 */
export async function pickupNearbyItems(bot: ExtendedBot): Promise<boolean> {
    const PICKUP_DISTANCE = 8;
    let pickedUp = 0;

    const getNearestItem = (bot: ExtendedBot) =>
        bot.nearestEntity((entity): entity is Entity =>
            entity !== null &&
            entity.name === 'item' &&
            bot.entity.position.distanceTo(entity.position) < PICKUP_DISTANCE
        );

    let nearestItem = getNearestItem(bot);

    while (nearestItem) {
        try {
            const movements = new Movements(bot);
            bot.pathfinder.setMovements(movements);

            await bot.pathfinder.goto(
                new goals.GoalFollow(nearestItem, 0.8)
            );

            // Wait for pickup physics
            await new Promise(resolve => setTimeout(resolve, 200));

            const previousItem = nearestItem;
            nearestItem = getNearestItem(bot);

            // Break if we can't reach the item
            if (previousItem === nearestItem) {
                break;
            }

            pickedUp++;
        } catch (err) {
            log(bot, `Failed to pick up item: ${err instanceof Error ? err.message : 'Unknown error'}`);
            break;
        }
    }

    log(bot, `Picked up ${pickedUp} items`);
    return true;
}



/**
 * Activates the nearest block of the specified type
 * @param bot - The Minecraft bot instance
 * @param type - Type of block to activate (e.g., 'lever', 'button')
 * @returns Promise resolving to true if block was activated
 *
 * @remarks
 * This function will:
 * 1. Find the nearest block of the specified type
 * 2. Navigate to within activation range if needed
 * 3. Activate the block (e.g., flip a lever, press a button)
 *
 * The bot must be within 4.5 blocks to activate. If further away,
 * it will automatically path to the block first.
 *
 * @example
 * ```typescript
 * // Activate a lever
 * await activateNearestBlock(bot, "lever");
 *
 * // Activate a button
 * await activateNearestBlock(bot, "stone_button");
 * ```
 *
 * @throws {Error} If block activation fails
 */
export async function activateNearestBlock(
    bot: ExtendedBot,
    type: string
): Promise<boolean> {
    // Find nearest block
    const block = getNearestBlock(bot, type, 16);

    if (!block) {
        log(bot, `Could not find any ${type} to activate`);
        return false;
    }

    try {
        // Move to block if needed
        if (bot.entity.position.distanceTo(block.position) > 4.5) {
            await moveToBlock(bot, block);
        }

        // Activate the block
        await bot.activateBlock(block);

        log(
            bot,
            `Activated ${type} at x:${block.position.x.toFixed(1)}, ` +
            `y:${block.position.y.toFixed(1)}, ` +
            `z:${block.position.z.toFixed(1)}`
        );
        return true;
    } catch (err) {
        log(bot, `Failed to activate ${type}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return false;
    }
}
