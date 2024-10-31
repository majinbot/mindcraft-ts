import { Bot } from 'mineflayer';
import prismarineViewer from 'prismarine-viewer';
const mineflayerViewer = prismarineViewer.mineflayer;

interface ViewerOptions {
    port: number;
    firstPerson: boolean;
}

export function addViewer(bot: Bot, countId: number): void {
    if (bot.settings?.showBotView) {
        mineflayerViewer(bot, {
            port: 3000 + countId,
            firstPerson: true
        } as ViewerOptions);
    }
}