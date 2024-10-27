/**
 * Main entry point for Minecraft utilities
 * @module mc
 */
import minecraftData from 'minecraft-data';
import PrismarineItem from 'prismarine-item';
import type { McDataContext } from './types';

// Re-export all modules
export * from './types';
export * from './constants';
export * from './player/bot';
export * from './world';

/**
 * Creates a new Minecraft data context
 * @param version - Minecraft version to use
 * @returns Initialized context object
 */
export function createContext(version: string): McDataContext {
    return {
        mcData: minecraftData(version),
        Item: PrismarineItem(version)
    };
}