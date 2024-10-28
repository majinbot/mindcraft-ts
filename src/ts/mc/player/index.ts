/**
 * World interaction and querying utilities
 * @module mc/player
 */
export * from '../player/inventory';
export * from '../player/crafting';
export * from '../player/items';
export * from '../player/navigation';
export * from '../player/bot';
export * from '../player/position';
export * from '../player/skills/blocks';
export * from '../player/skills/crafting';
export * from '../player/skills/farming';
export * from '../player/skills/torch'; 
export * from '../player/skills/combat'; 
export * from '../player/skills/equipment'; 

// Re-export common types
export type { InventoryCounts } from '../player/inventory';
export type { NavigationOptions } from '../player/navigation';