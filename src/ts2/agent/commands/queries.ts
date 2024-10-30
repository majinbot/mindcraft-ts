import { Command } from './types';
import { Agent } from '../index';
import * as world from '../library/world';

export const queryList: Command[] = [
    {
        name: "!stats",
        description: "Get your bot's location, health, hunger, and time of day.",
        perform: (agent: Agent): string => {
            const bot = agent.bot;
            const pos = bot.entity.position;
            const weather = bot.rainState > 0 ? "Rain" : bot.thunderState > 0 ? "Thunderstorm" : "Clear";
            const timeOfDay = bot.time.timeOfDay < 6000 ? 'Morning'
                : bot.time.timeOfDay < 12000 ? 'Afternoon' : 'Night';
            const players = world.getNearbyPlayerNames(bot);

            return [
                'STATS',
                `- Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`,
                `- Gamemode: ${bot.game.gameMode}`,
                `- Health: ${Math.round(bot.health)} / 20`,
                `- Hunger: ${Math.round(bot.food)} / 20`,
                `- Biome: ${world.getBiomeName(bot)}`,
                `- Weather: ${weather}`,
                `- Time: ${timeOfDay}`,
                players.length > 0 ? `- Other Players: ${players.join(', ')}` : '',
                agent.bot.modes.getMiniDocs(),
                ''
            ].filter(Boolean).join('\n');
        }
    },
    {
        name: "!inventory",
        description: "Get your bot's inventory.",
        perform: (agent: Agent): string => {
            const inventory = world.getInventoryCounts(agent.bot);
            const lines = ['INVENTORY'];

            // Add inventory items
            Object.entries(inventory)
                .filter(([_, count]) => count > 0)
                .forEach(([item, count]) => lines.push(`- ${item}: ${count}`));

            if (lines.length === 1) lines.push(': none');

            if (agent.bot.game.gameMode === 'creative') {
                lines.push('\n(You have infinite items in creative mode. You do not need to gather resources!!)');
            }

            // Add equipment
            lines.push('\nWEARING: ');
            const equipment = [
                [5, 'Head'], [6, 'Torso'], [7, 'Legs'], [8, 'Feet']
            ].map(([slot, type]) => {
                const item = agent.bot.inventory.slots[slot];
                return item ? `\n${type}: ${item.name}` : null;
            }).filter(Boolean);

            if (equipment.length) {
                lines.push(...equipment);
            } else {
                lines.push('None');
            }

            return lines.join('');
        }
    },
    {
        name: "!nearbyBlocks",
        description: "Get the blocks near the bot.",
        perform: (agent: Agent): string => {
            const blocks = world.getNearbyBlockTypes(agent.bot);
            return [
                'NEARBY_BLOCKS',
                ...(blocks.length ? blocks.map(b => `- ${b}`) : [': none'])
            ].join('\n');
        }
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: (agent: Agent): string => {
            const table = world.getNearestBlock(agent.bot, 'crafting_table');
            const craftableItems = [];

            for (const item of mc.getAllItems()) {
                if (agent.bot.recipesFor(item.id, null, 1, table).length > 0) {
                    craftableItems.push(`- ${item.name}`);
                }
            }

            return [
                'CRAFTABLE_ITEMS',
                ...(craftableItems.length ? craftableItems : [': none'])
            ].join('\n');
        }
    },
    {
        name: "!entities",
        description: "Get the nearby players and entities.",
        perform: (agent: Agent): string => {
            const players = world.getNearbyPlayerNames(agent.bot)
                .map(e => `- player: ${e}`);
            const entities = world.getNearbyEntityTypes(agent.bot)
                .filter(e => e !== 'player' && e !== 'item')
                .map(e => `- entities: ${e}`);

            return [
                'NEARBY_ENTITIES',
                ...(players.length || entities.length ? [...players, ...entities] : [': none'])
            ].join('\n');
        }
    },
    {
        name: "!modes",
        description: "Get all available modes and their docs and see which are on/off.",
        perform: (agent: Agent): string => {
            return agent.bot.modes.getDocs();
        }
    },
    {
        name: '!savedPlaces',
        description: 'List all saved locations.',
        perform: (agent: Agent): string => {
            return "Saved place names: " + agent.memory_bank.getKeys();
        }
    }
];
