import * as skills from './library/skills';
import * as world from './library/world';
import * as mc from '../utils/mcdata';
import settings from '../../settings';
import { handleTranslation } from '../utils/translator';
import type { Agent } from '..';
import type { Mode, ModesData, ModeExecuteReturn } from '../../types/modes';
import type { Vec3 } from 'vec3';

async function say(agent: Agent, message: string): Promise<void> {
    agent.bot.modes.behaviorLog += `${message}\n`;
    if (agent.shutUp || !settings.narrateBehavior) return;
    const translation = await handleTranslation(message);
    agent.bot.chat(translation);
}

async function execute(
    mode: Mode, 
    agent: Agent, 
    func: () => Promise<void>, 
    timeout: number = -1
): Promise<ModeExecuteReturn> {
    if (agent.selfPrompter.on) {
        await agent.selfPrompter.stopLoop();
    }
    mode.active = true;
    const codeReturn = await agent.coder.execute(func, timeout);
    mode.active = false;
    console.log(`Mode ${mode.name} finished executing, code_return: ${codeReturn.message}`);
    return codeReturn;
}

const baseMode: Partial<Mode> = {
    on: true,
    active: false,
    paused: false
};

const modes: Mode[] = [
    {
        ...baseMode,
        name: 'self_preservation',
        description: 'Respond to drowning, burning, and damage at low health. Interrupts all actions.',
        interrupts: ['all'],
        fallBlocks: ['sand', 'gravel', 'concrete_powder'],
        update: async function(agent: Agent): Promise<void> {
            const bot = agent.bot;
            const block = bot.blockAt(bot.entity.position) ?? { name: 'air' };
            const blockAbove = bot.blockAt(bot.entity.position.offset(0, 1, 0)) ?? { name: 'air' };

            if (blockAbove.name === 'water' || blockAbove.name === 'flowing_water') {
                if (!bot.pathfinder.goal) {
                    bot.setControlState('jump', true);
                }
            }
            else if (this.fallBlocks.some(name => blockAbove.name.includes(name))) {
                await execute(this, agent, async () => {
                    await skills.moveAway(bot, 2);
                });
            }
            else if (block.name === 'lava' || block.name === 'flowing_lava' || block.name === 'fire' ||
                blockAbove.name === 'lava' || blockAbove.name === 'flowing_lava' || blockAbove.name === 'fire') {
                await say(agent, 'I\'m on fire!');
                await execute(this, agent, async () => {
                    const nearestWater = world.getNearestBlock(bot, 'water', 20);
                    if (nearestWater) {
                        const pos = nearestWater.position;
                        await skills.goToPosition(bot, pos.x, pos.y, pos.z, 0.2);
                        await say(agent, 'Ahhhh that\'s better!');
                    } else {
                        await skills.moveAway(bot, 5);
                    }
                });
            }
            else if (Date.now() - bot.lastDamageTime < 3000 && (bot.health < 5 || bot.lastDamageTaken >= bot.health)) {
                await say(agent, 'I\'m dying!');
                await execute(this, agent, async () => {
                    await skills.moveAway(bot, 20);
                });
            }
            else if (agent.isIdle()) {
                bot.clearControlStates();
            }
        }
    },
    {
        ...baseMode,
        name: 'unstuck',
        description: 'Attempt to get unstuck when in the same place for a while. Interrupts some actions.',
        interrupts: ['all'],
        prevLocation: null as Vec3 | null,
        distance: 2,
        stuckTime: 0,
        lastTime: Date.now(),
        maxStuckTime: 20,
        update: async function(agent: Agent): Promise<void> {
            if (agent.isIdle()) {
                this.prevLocation = null;
                this.stuckTime = 0;
                return;
            }

            const bot = agent.bot;
            if (this.prevLocation && this.prevLocation.distanceTo(bot.entity.position) < this.distance) {
                this.stuckTime += (Date.now() - this.lastTime) / 1000;
            } else {
                this.prevLocation = bot.entity.position.clone();
                this.stuckTime = 0;
            }

            if (this.stuckTime > this.maxStuckTime) {
                await say(agent, 'I\'m stuck!');
                this.stuckTime = 0;
                await execute(this, agent, async () => {
                    const crashTimeout = setTimeout(() => {
                        agent.cleanKill("Got stuck and couldn't get unstuck");
                    }, 10000);
                    await skills.moveAway(bot, 5);
                    clearTimeout(crashTimeout);
                });
            }
            this.lastTime = Date.now();
        }
    },

    {
        ...baseMode,
        name: 'cowardice',
        description: 'Run away from enemies. Interrupts all actions.',
        interrupts: ['all'],
        update: async function(agent: Agent): Promise<void> {
            const enemy = world.getNearestEntityWhere(agent.bot, entity => mc.isHostile(entity), 16);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                await say(agent, `Aaa! A ${enemy.name}!`);
                await execute(this, agent, async () => {
                    await skills.avoidEnemies(agent.bot, 24);
                });
            }
        }
    },

    {
        ...baseMode,
        name: 'self_defense',
        description: 'Attack nearby enemies. Interrupts all actions.',
        interrupts: ['all'],
        update: async function(agent: Agent): Promise<void> {
            const enemy = world.getNearestEntityWhere(agent.bot, entity => mc.isHostile(entity), 8);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                await say(agent, `Fighting ${enemy.name}!`);
                await execute(this, agent, async () => {
                    await skills.defendSelf(agent.bot, 8);
                });
            }
        }
    },

    {
        ...baseMode,
        name: 'hunting',
        description: 'Hunt nearby animals when idle.',
        interrupts: [],
        update: async function(agent: Agent): Promise<void> {
            const huntable = world.getNearestEntityWhere(agent.bot, entity => mc.isHuntable(entity), 8);
            if (huntable && await world.isClearPath(agent.bot, huntable)) {
                await execute(this, agent, async () => {
                    await say(agent, `Hunting ${huntable.name}!`);
                    await skills.attackEntity(agent.bot, huntable);
                });
            }
        }
    },

    {
        ...baseMode,
        name: 'item_collecting',
        description: 'Collect nearby items when idle.',
        interrupts: ['followPlayer'],
        wait: 2,
        prevItem: null as any,
        noticedAt: -1,
        update: async function(agent: Agent): Promise<void> {
            const item = world.getNearestEntityWhere(agent.bot, entity => entity.name === 'item', 8);
            const emptyInvSlots = agent.bot.inventory.emptySlotCount();

            if (item && item !== this.prevItem && await world.isClearPath(agent.bot, item) && emptyInvSlots > 1) {
                if (this.noticedAt === -1) {
                    this.noticedAt = Date.now();
                }
                if (Date.now() - this.noticedAt > this.wait * 1000) {
                    await say(agent, 'Picking up item!');
                    this.prevItem = item;
                    await execute(this, agent, async () => {
                        await skills.pickupNearbyItems(agent.bot);
                    });
                    this.noticedAt = -1;
                }
            } else {
                this.noticedAt = -1;
            }
        }
    },

    {
        ...baseMode,
        name: 'torch_placing',
        description: 'Place torches when idle and there are no torches nearby.',
        interrupts: ['followPlayer'],
        cooldown: 5,
        lastPlace: Date.now(),
        update: async function(agent: Agent): Promise<void> {
            if (world.shouldPlaceTorch(agent.bot)) {
                if (Date.now() - this.lastPlace < this.cooldown * 1000) return;
                await execute(this, agent, async () => {
                    const pos = agent.bot.entity.position;
                    await skills.placeBlock(agent.bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
                });
                this.lastPlace = Date.now();
            }
        }
    },

    {
        ...baseMode,
        name: 'idle_staring',
        description: 'Animation to look around at entities when idle.',
        interrupts: [],
        staring: false,
        lastEntity: null as any,
        nextChange: 0,
        update: async function(agent: Agent): Promise<void> {
            const entity = agent.bot.nearestEntity();
            const entityInView = entity && 
                entity.position.distanceTo(agent.bot.entity.position) < 10 && 
                entity.name !== 'enderman';

            if (entityInView && entity !== this.lastEntity) {
                this.staring = true;
                this.lastEntity = entity;
                this.nextChange = Date.now() + Math.random() * 1000 + 4000;
            }

            if (entityInView && this.staring) {
                const isBaby = entity.type !== 'player' && entity.metadata[16];
                const height = isBaby ? entity.height/2 : entity.height;
                agent.bot.lookAt(entity.position.offset(0, height, 0));
            }

            if (!entityInView) {
                this.lastEntity = null;
            }

            if (Date.now() > this.nextChange) {
                this.staring = Math.random() < 0.3;
                if (!this.staring) {
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                    agent.bot.look(yaw, pitch, false);
                }
                this.nextChange = Date.now() + Math.random() * 10000 + 2000;
            }
        }
    },

    {
        ...baseMode,
        name: 'cheat',
        description: 'Use cheats to instantly place blocks and teleport.',
        interrupts: [],
        on: false,
        update: async function(): Promise<void> { /* do nothing */ }
    }
];

class ModeController {
    private agent: Agent;
    private modesList: Mode[];
    private modesMap: { [key: string]: Mode };
    private behaviorLog: string;

    constructor(agent: Agent) {
        this.agent = agent;
        this.modesList = modes;
        this.modesMap = {};
        this.behaviorLog = '';

        for (const mode of this.modesList) {
            this.modesMap[mode.name] = mode;
        }
    }

    exists(modeName: string): boolean {
        return modeName in this.modesMap;
    }

    setOn(modeName: string, on: boolean): void {
        if (this.exists(modeName)) {
            this.modesMap[modeName].on = on;
        }
    }

    isOn(modeName: string): boolean {
        return this.exists(modeName) && this.modesMap[modeName].on;
    }

    pause(modeName: string): void {
        if (this.exists(modeName)) {
            this.modesMap[modeName].paused = true;
        }
    }

    unpause(modeName: string): void {
        if (this.exists(modeName)) {
            this.modesMap[modeName].paused = false;
        }
    }

    unPauseAll(): void {
        for (const mode of this.modesList) {
            if (mode.paused) {
                console.log(`Unpausing mode ${mode.name}`);
                mode.paused = false;
            }
        }
    }

    getMiniDocs(): string {
        return ['Agent Modes:', 
            ...this.modesList.map(mode => 
                `- ${mode.name}(${mode.on ? 'ON' : 'OFF'})`)
        ].join('\n');
    }

    getDocs(): string {
        return ['Agent Modes:', 
            ...this.modesList.map(mode => 
                `- ${mode.name}(${mode.on ? 'ON' : 'OFF'}): ${mode.description}`)
        ].join('\n');
    }

    async update(): Promise<void> {
        if (this.agent.isIdle()) {
            this.unPauseAll();
        }

        for (const mode of this.modesList) {
            const interruptible = mode.interrupts.includes('all') || 
                mode.interrupts.includes(this.agent.coder.curActionName);

            if (mode.on && !mode.paused && !mode.active && 
                (this.agent.isIdle() || interruptible)) {
                await mode.update(this.agent);
                if (mode.active) break;
            }
        }
    }

    flushBehaviorLog(): string {
        const log = this.behaviorLog;
        this.behaviorLog = '';
        return log;
    }

    getJson(): ModesData {
        return Object.fromEntries(
            this.modesList.map(mode => [mode.name, mode.on])
        );
    }

    loadJson(json: ModesData): void {
        for (const mode of this.modesList) {
            if (json[mode.name] !== undefined) {
                mode.on = json[mode.name];
            }
        }
    }
}

export function initModes(agent: Agent): void {
    agent.bot.modes = new ModeController(agent);
    const modes = agent.prompter.getInitModes();
    if (modes) {
        agent.bot.modes.loadJson(modes);
    }
}
