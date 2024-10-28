import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import * as mc from '../../utils/mcdata';

export function itemSatisfied(bot: Bot, itemName: string, quantity: number = 1): boolean {
    const inventory = bot.inventory.items();
    let count = 0;
    for (const item of inventory) {
        if (item.name === itemName) {
            count += item.count;
        }
    }
    return count >= quantity;
}

export function blockSatisfied(blockName: string, block: Block): boolean {
    if (blockName === 'air' && block.name === 'air') return true;
    if (blockName.includes('door') && block.name.includes('door')) return true;
    return blockName === block.name;
}

export function getTypeOfGeneric(bot: Bot, blockName: string): string {
    if (blockName.includes('door')) {
        return mc.getDoorType(blockName);
    }
    return blockName;
}

export function rotateXZ(
    x: number, 
    z: number, 
    orientation: number, 
    sizex: number, 
    sizez: number
): [number, number] {
    if (orientation === 0) return [x, z];
    if (orientation === 1) return [z, sizex - 1 - x];
    if (orientation === 2) return [sizex - 1 - x, sizez - 1 - z];
    return [sizez - 1 - z, x];
}
