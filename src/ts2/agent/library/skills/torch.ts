import {ExtendedBot} from "../../../types/mc";
import {getPosition, shouldPlaceTorch} from "../world";
import {placeBlock} from "./blocks";

/**
 * Automatically places a torch at the bot's current position if conditions are met
 *
 * @param bot - The Minecraft bot instance
 * @returns Promise resolving to true if torch was placed successfully, false otherwise
 *
 * @remarks
 * This function checks if a torch should be placed using world.shouldPlaceTorch()
 * and attempts to place it at the bot's current position. It handles errors silently
 * and returns false if anything goes wrong.
 */
export async function autoLight(bot: ExtendedBot): Promise<boolean> {
    try {
        if (!shouldPlaceTorch(bot)) {
            return false;
        }

        const pos = getPosition(bot);
        return await placeBlock(bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
    } catch (err) {
        // Log error for debugging while maintaining the original behavior of silent failure
        console.debug('Failed to place torch:', err);
        return false;
    }
}
