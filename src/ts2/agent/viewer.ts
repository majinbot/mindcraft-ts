import { Bot } from 'mineflayer';
import prismarineViewer from 'prismarine-viewer';
const mineflayerViewer = prismarineViewer.mineflayer;

interface ViewerOptions {
    port: number;
    firstPerson: boolean;
}

export function addViewer(bot: Bot, countId: number): void {
    // TODO: fix config/settings
    if (bot.settings?.colorsEnabled) {
        mineflayerViewer(bot, {
            port: 3000 + countId,
            firstPerson: true
        } as ViewerOptions);
    }
}