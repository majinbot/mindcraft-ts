import type { Command } from '../../types/mc/commands';
import type { Agent } from '../agent';
import { 
    getNearbyBlockTypes,
    getNearbyEntityTypes,
    getNearbyPlayerNames,
    getBiomeName,
    getNearestBlock
} from '../../mc/world';
import { getAllItems } from '../../mc/player/items';
import { getInventoryCounts } from '../../mc/player/inventory';
import { Item } from 'prismarine-item';

const pad = (str: string): string => `\n${str}\n`;

export const queryList: Command[] = [
    {
        name: "!stats",
        description: "Get your bot's location, health, hunger, and time of day.",
        perform: function(agent: Agent): string {
            const bot = agent.bot;
            const pos = bot.entity.position;
            let res = 'STATS';
            
            res += `\n- Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`;
            res += `\n- Gamemode: ${bot.game.gameMode}`;
            res += `\n- Health: ${Math.round(bot.health)} / 20`;
            res += `\n- Hunger: ${Math.round(bot.food)} / 20`;
            res += `\n- Biome: ${getBiomeName(bot)}`;
            
            let weather = "Clear";
            if (bot.rainState > 0) weather = "Rain";
            if (bot.thunderState > 0) weather = "Thunderstorm";
            res += `\n- Weather: ${weather}`;

            if (bot.time.timeOfDay < 6000) {
                res += '\n- Time: Morning';
            } else if (bot.time.timeOfDay < 12000) {
                res += '\n- Time: Afternoon';
            } else {
                res += '\n- Time: Night';
            }

            const otherPlayers = getNearbyPlayerNames(bot);
            if (otherPlayers.length > 0) {
                res += '\n- Other Players: ' + otherPlayers.join(', ');
            }

            res += '\n' + bot.modes.getMiniDocs() + '\n';
            return pad(res);
        }
    },
    {
        name: "!inventory",
        description: "Get your bot's inventory.",
        perform: function(agent: Agent): string {
            const bot = agent.bot;
            const inventory = getInventoryCounts(bot);
            let res = 'INVENTORY';

            for (const item in inventory) {
                if (inventory[item] && inventory[item] > 0) {
                    res += `\n- ${item}: ${inventory[item]}`;
                }
            }

            if (res === 'INVENTORY') {
                res += ': none';
            } else if (bot.game.gameMode === 'creative') {
                res += '\n(You have infinite items in creative mode. You do not need to gather resources!!)';
            }

            const equipment: Record<number, Item> = {
                5: bot.inventory.slots[5], // helmet
                6: bot.inventory.slots[6], // chestplate
                7: bot.inventory.slots[7], // leggings
                8: bot.inventory.slots[8]  // boots
            };

            res += '\nWEARING: ';
            const slots = {
                5: 'Head',
                6: 'Torso',
                7: 'Legs',
                8: 'Feet'
            };

            let wearing = false;
            for (const [slot, item] of Object.entries(equipment)) {
                if (item) {
                    res += `\n${slots[slot]}: ${item.name}`;
                    wearing = true;
                }
            }
            
            if (!wearing) res += 'None';
            return pad(res);
        }
    },
    {
        name: "!nearbyBlocks",
        description: "Get the blocks near the bot.",
        perform: function(agent: Agent): string {
            const blocks = getNearbyBlockTypes(bot);
            let res = 'NEARBY_BLOCKS';
            
            blocks.forEach(block => {
                res += `\n- ${block}`;
            });

            if (blocks.length === 0) {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: function(agent: Agent): string {
            const bot = agent.bot;
            const table = getNearestBlock(bot, 'crafting_table');
            let res = 'CRAFTABLE_ITEMS';

            getAllItems(bot.mcData).forEach(item => {
                const recipes = bot.recipesFor(item.id, null, 1, table);
                if (recipes.length > 0) {
                    res += `\n- ${item.name}`;
                }
            });

            if (res === 'CRAFTABLE_ITEMS') {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: "!entities",
        description: "Get the nearby players and entities.",
        perform: function(agent: Agent): string {
            const bot = agent.bot;
            let res = 'NEARBY_ENTITIES';

            getNearbyPlayerNames(bot).forEach(player => {
                res += `\n- player: ${player}`;
            });

            getNearbyEntityTypes(bot)
                .filter(entity => entity !== 'player' && entity !== 'item')
                .forEach(entity => {
                    res += `\n- entities: ${entity}`;
                });

            if (res === 'NEARBY_ENTITIES') {
                res += ': none';
            }
            return pad(res);
        }
    }
];
