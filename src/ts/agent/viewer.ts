import settings from '../settings';
import prismarineViewer from 'prismarine-viewer';
import type { Bot } from 'mineflayer';
import type { ViewerOptions } from '../types/viewer';

const mineflayerViewer = prismarineViewer.mineflayer;

/**
 * Adds a web-based viewer for the Minecraft bot
 * @param bot - The Mineflayer bot instance
 * @param countId - Unique identifier for the bot to determine port number
 * @param options - Optional viewer configuration
 */
export function addViewer(
    bot: Bot, 
    countId: number,
    options: Partial<ViewerOptions> = {}
): void {
    if (!settings.showBotViews) return;

    const defaultOptions: ViewerOptions = {
        port: 3000 + countId,
        firstPerson: true,
        frames: 60,
        width: 800,
        height: 600,
        viewDistance: 6,
        followDistance: 3
    };

    const viewerOptions = { ...defaultOptions, ...options };
    
    try {
        mineflayerViewer(bot, viewerOptions);
        console.log(`Viewer started on port ${viewerOptions.port}`);
    } catch (error) {
        console.error('Failed to start viewer:', error);
    }
}
