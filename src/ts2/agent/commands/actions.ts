import { Command } from './types';
import { Agent } from '../index';
import * as skills from '../library/skills';

/**
 * Wraps command execution with timeout and resume capabilities
 */
function wrapExecution(
    func: (agent: Agent, ...args: any[]) => Promise<void>,
    resume = false,
    timeout = -1
): (agent: Agent, ...args: any[]) => Promise<string | void> {
    return async function(agent: Agent, ...args: any[]): Promise<string | void> {
        const timeoutMs = timeout === -1 ? -1 : timeout * 60 * 1000;

        let codeReturn;
        const wrappedFunction = async () => {
            await func(agent, ...args);
        };

        try {
            if (resume) {
                codeReturn = await agent.coder.executeResume(wrappedFunction, timeoutMs);
            } else {
                codeReturn = await agent.coder.execute(wrappedFunction, timeoutMs);
            }
        } catch (err: any) {
            console.error('Command execution failed:', err);
            return `Command failed: ${err.message}`;
        }

        if (codeReturn.interrupted && !codeReturn.timedout)
            return;
        return codeReturn.message;
    };
}

export const actionsList: Command[] = [
    {
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors not available as a command.',
        params: {
            'prompt': { type: 'string', description: 'Natural language prompt for code generation' }
        },
        perform: async (agent: Agent, prompt: string): Promise<string> => {
            if (!agent.settings.allow_unsafe_coding) {
                return 'newAction not allowed! Code writing is disabled in settings.';
            }
            return await agent.coder.generateCode(agent.history);
        }
    },

    {
        name: '!stop',
        description: 'Force stop all executing actions and commands.',
        perform: async (agent: Agent): Promise<string> => {
            await agent.coder.stop();
            agent.coder.clear();
            agent.coder.cancelResume();
            agent.bot.emit('idle');
            return `Agent stopped.${agent.self_prompter.on ? ' Self-prompting still active.' : ''}`;
        }
    },

    {
        name: '!stfu',
        description: 'Stop all chatting and self prompting, but continue current action.',
        perform: async (agent: Agent): Promise<void> => {
            agent.bot.chat('Shutting up.');
            agent.shutUp();
        }
    },

    {
        name: '!restart',
        description: 'Restart the agent process.',
        perform: async (agent: Agent): Promise<void> => {
            agent.history.save();
            agent.cleanKill();
        }
    },

    {
        name: '!clearChat',
        description: 'Clear the chat history.',
        perform: async (agent: Agent): Promise<string> => {
            agent.history.clear();
            return `${agent.name}'s chat history cleared, starting new conversation.`;
        }
    },

    {
        name: '!goToPlayer',
        description: 'Go to the given player.',
        params: {
            'player_name': { type: 'string', description: 'Player name to go to' },
            'closeness': { type: 'float', description: 'How close to get', domain: [0, Infinity] }
        },
        perform: wrapExecution(async (agent: Agent, player_name: string, closeness: number) => {
            await skills.goToPlayer(agent.bot, player_name, { minDistance: closeness });
        })
    },

    {
        name: '!followPlayer',
        description: 'Endlessly follow given player. Will defend if self_defense mode is on.',
        params: {
            'player_name': { type: 'string', description: 'Player to follow' },
            'follow_dist': { type: 'float', description: 'Distance to maintain', domain: [0, Infinity] }
        },
        perform: wrapExecution(async (agent: Agent, player_name: string, follow_dist: number) => {
            await skills.followPlayer(agent.bot, player_name, { distance: follow_dist });
        }, true)
    },

    {
        name: '!goToBlock',
        description: 'Go to nearest block of given type.',
        params: {
            'type': { type: 'BlockName', description: 'Block type to go to' },
            'closeness': { type: 'float', description: 'How close to get', domain: [0, Infinity] },
            'range': { type: 'float', description: 'Search range', domain: [0, Infinity] }
        },
        perform: wrapExecution(async (agent: Agent, type: string, closeness: number, range: number) => {
            await skills.goToNearestBlock(agent.bot, type, {
                minDistance: closeness,
                maxRange: range
            });
        })
    },

    {
        name: '!moveAway',
        description: 'Move away from current location in any direction.',
        params: {
            'distance': { type: 'float', description: 'Distance to move', domain: [0, Infinity] }
        },
        perform: wrapExecution(async (agent: Agent, distance: number) => {
            await skills.moveAway(agent.bot, distance);
        })
    },

    {
        name: '!rememberHere',
        description: 'Save current location with given name.',
        params: {
            'name': { type: 'string', description: 'Name to save location as' }
        },
        perform: (agent: Agent, name: string): string => {
            const pos = agent.bot.entity.position;
            agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
            return `Location saved as "${name}".`;
        }
    },

    {
        name: '!goToPlace',
        description: 'Go to a saved location.',
        params: {
            'name': { type: 'string', description: 'Location name to go to' }
        },
        perform: wrapExecution(async (agent: Agent, name: string) => {
            const pos = agent.memory_bank.recallPlace(name);
            if (!pos) {
                skills.log(agent.bot, `No location named "${name}" saved.`);
                return;
            }
            await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], { minDistance: 1 });
        })
    },

    {
        name: '!givePlayer',
        description: 'Give specified item to given player.',
        params: {
            'player_name': { type: 'string', description: 'Player to give to' },
            'item_name': { type: 'ItemName', description: 'Item to give' },
            'num': { type: 'int', description: 'Number of items', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent: Agent, player_name: string, item_name: string, num: number) => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, { count: num });
        })
    },

    {
        name: '!consume',
        description: 'Eat/drink given item.',
        params: {
            'item_name': { type: 'ItemName', description: 'Item to consume' }
        },
        perform: wrapExecution(async (agent: Agent, item_name: string) => {
            await skills.eat(agent.bot, item_name);
        })
    },

    {
        name: '!equip',
        description: 'Equip given item.',
        params: {
            'item_name': { type: 'ItemName', description: 'Item to equip' }
        },
        perform: wrapExecution(async (agent: Agent, item_name: string) => {
            await skills.equip(agent.bot, item_name);
        })
    },

    {
        name: '!putInChest',
        description: 'Put given item in nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'Item to store' },
            'num': { type: 'int', description: 'Number of items', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent: Agent, item_name: string, num: number) => {
            await skills.putInChest(agent.bot, item_name, { count: num });
        })
    },

    {
        name: '!takeFromChest',
        description: 'Take given items from nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'Item to take' },
            'num': { type: 'int', description: 'Number of items', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent: Agent, item_name: string, num: number) => {
            await skills.takeFromChest(agent.bot, item_name, { count: num });
        })
    },

    {
        name: '!viewChest',
        description: 'View items/counts in nearest chest.',
        perform: wrapExecution(async (agent: Agent) => {
            await skills.viewChest(agent.bot);
        })
    },

    {
        name: '!discard',
        description: 'Discard given item from inventory.',
        params: {
            'item_name': { type: 'ItemName', description: 'Item to discard' },
            'num': { type: 'int', description: 'Number to discard', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent: Agent, item_name: string, num: number) => {
            await skills.discard(agent.bot, item_name, { count: num });
        })
    },

    {
        name: '!collectBlocks',
        description: 'Collect nearest blocks of given type.',
        params: {
            'type': { type: 'BlockName', description: 'Block type to collect' },
            'num': { type: 'int', description: 'Number to collect', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent: Agent, type: string, num: number) => {
            await skills.collectBlock(agent.bot, type, num);
        }, false, 10)
    },

    {
        name: '!collectAllBlocks',
        description: 'Collect all nearest blocks of type until stopped.',
        params: {
            'type': { type: 'BlockName', description: 'Block type to collect' }
        },
        perform: wrapExecution(async (agent: Agent, type: string) => {
            const success = await skills.collectBlock(agent.bot, type, 1);
            if (!success) {
                agent.coder.cancelResume();
            }
        }, true, 3)
    },

    {
        name: '!craftRecipe',
        description: 'Craft given recipe specified number of times.',
        params: {
            'recipe_name': { type: 'ItemName', description: 'Output item to craft' },
            'num': { type: 'int', description: 'Times to craft recipe', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent: Agent, recipe_name: string, num: number) => {
            await skills.craftRecipe(agent.bot, recipe_name, num);
        })
    },

    {
        name: '!smeltItem',
        description: 'Smelt given item specified number of times.',
        params: {
            'item_name': { type: 'ItemName', description: 'Input item to smelt' },
            'num': { type: 'int', description: 'Times to smelt', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: async (agent: Agent, item_name: string, num: number): Promise<string> => {
            const response = await wrapExecution(async (agent: Agent) => {
                const result = await skills.smeltItem(agent.bot, item_name, num);
                if (!result.success) {
                    throw new Error(`Failed to smelt ${item_name}`);
                }
            })(agent);

            // Handle inventory update bug after smelting
            if (response?.includes('Successfully')) {
                agent.cleanKill(response + ' Safely restarting to update inventory.');
            }
            return response || '';
        }
    },

    {
        name: '!clearFurnace',
        description: 'Take all items from nearest furnace.',
        perform: wrapExecution(async (agent: Agent) => {
            await skills.clearNearestFurnace(agent.bot);
        })
    },

    {
        name: '!placeHere',
        description: 'Place block at current location. For single blocks only.',
        params: {
            'type': { type: 'BlockName', description: 'Block type to place' }
        },
        perform: wrapExecution(async (agent: Agent, type: string) => {
            const pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        })
    },

    {
        name: '!attack',
        description: 'Attack and kill nearest entity of given type.',
        params: {
            'type': { type: 'string', description: 'Entity type to attack' }
        },
        perform: wrapExecution(async (agent: Agent, type: string) => {
            await skills.attackNearest(agent.bot, type, { killTarget: true });
        })
    },

    {
        name: '!goToBed',
        description: 'Go to nearest bed and sleep.',
        perform: wrapExecution(async (agent: Agent) => {
            await skills.goToBed(agent.bot);
        })
    },

    {
        name: '!activate',
        description: 'Activate nearest object of given type.',
        params: {
            'type': { type: 'BlockName', description: 'Object type to activate' }
        },
        perform: wrapExecution(async (agent: Agent, type: string) => {
            await skills.activateNearestBlock(agent.bot, type);
        })
    },

    {
        name: '!stay',
        description: 'Stay in current location. Pauses all modes.',
        params: {
            'seconds': { type: 'int', description: 'Seconds to stay (-1 for forever)', domain: [-1, Number.MAX_SAFE_INTEGER] }
        },
        perform: wrapExecution(async (agent: Agent, seconds: number) => {
            await skills.stay(agent.bot, { duration: seconds });
        })
    }
]