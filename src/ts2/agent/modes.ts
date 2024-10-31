import { Agent } from './index';
import * as skills from './library/skills';
import * as world from './library/world';
import * as mc from '../utils/mcdata';
import { handleTranslation } from '../utils/translation';
import { Vec3 } from 'vec3';
import { Entity } from 'prismarine-entity';
import {RuntimeEntity} from "../utils/mcdata";

export interface Mode {
    name: string;
    description: string;
    interrupts: string[];
    on: boolean;
    active: boolean;
    paused?: boolean;
    [key: string]: any;
    update: (agent: Agent) => Promise<void>;
}

async function say(agent: Agent, message: string): Promise<void> {
    agent.bot.modes.behavior_log += message + '\n';
    if (agent.isQuiet() || !agent.settings.narrate_behavior) return;
    const translation = await handleTranslation(message);
    agent.bot.chat(translation);
}

async function execute(
    mode: Mode,
    agent: Agent,
    func: () => Promise<void>,
    timeout = -1
): Promise<void> {
    if (agent.self_prompter.on) {
        await agent.self_prompter.stopLoop();
    }
    mode.active = true;
    const codeReturn = await agent.coder.execute(func, timeout);
    mode.active = false;
    console.log(`Mode ${mode.name} finished executing:`, codeReturn.message);
}

const modes: Mode[] = [
    {
        name: 'self_preservation',
        description: 'Respond to drowning, burning, and damage at low health. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        fall_blocks: ['sand', 'gravel', 'concrete_powder'],
        async update(agent: Agent): Promise<void> {
            const bot = agent.bot;
            const pos = bot.entity.position;
            const block = bot.blockAt(pos) || { name: 'air' };
            const blockAbove = bot.blockAt(pos.offset(0, 1, 0)) || { name: 'air' };

            if (blockAbove.name === 'water' || blockAbove.name === 'flowing_water') {
                if (!bot.pathfinder.goal) {
                    bot.setControlState('jump', true);
                }
                return;
            }

            if (this.fall_blocks.some((name: string) => blockAbove.name.includes(name))) {
                await execute(this, agent, async () => {
                    await skills.moveAway(bot, 2);
                });
            } else if (['lava', 'flowing_lava', 'fire'].some(name =>
                block.name === name || blockAbove.name === name)) {
                await say(agent, "I'm on fire!");
                await execute(this, agent, async () => {
                    const water = world.getNearestBlock(bot, 'water', 20);
                    if (water) {
                        const pos = water.position;
                        await skills.goToPosition(bot, pos.x, pos.y, pos.z, 0.2);
                        await say(agent, "Ahhhh that's better!");
                    } else {
                        await skills.moveAway(bot, 5);
                    }
                });
            } else if (Date.now() - bot.lastDamageTime < 3000 &&
                (bot.health < 5 || bot.lastDamageTaken >= bot.health)) {
                await say(agent, "I'm dying!");
                await execute(this, agent, async () => {
                    await skills.moveAway(bot, 20);
                });
            } else if (agent.isIdle()) {
                bot.clearControlStates();
            }
        }
    },

    {
        name: 'unstuck',
        description: 'Attempt to get unstuck when in same place for a while. Interrupts some actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        prev_location: null as Vec3 | null,
        distance: 2,
        stuck_time: 0,
        last_time: Date.now(),
        max_stuck_time: 20,
        async update(agent: Agent): Promise<void> {
            if (agent.isIdle()) {
                this.prev_location = null;
                this.stuck_time = 0;
                return;
            }
            const bot = agent.bot;
            if (this.prev_location && this.prev_location.distanceTo(bot.entity.position) < this.distance) {
                this.stuck_time += (Date.now() - this.last_time) / 1000;
            } else {
                this.prev_location = bot.entity.position.clone();
                this.stuck_time = 0;
            }
            if (this.stuck_time > this.max_stuck_time) {
                await say(agent, "I'm stuck!");
                this.stuck_time = 0;
                await execute(this, agent, async () => {
                    const crashTimeout = setTimeout(() => {
                        agent.cleanKill("Got stuck and couldn't get unstuck");
                    }, 10000);
                    await skills.moveAway(bot, 5);
                    clearTimeout(crashTimeout);
                });
            }
            this.last_time = Date.now();
        }
    },

    {
        name: 'cowardice',
        description: 'Run away from enemies. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        async update(agent: Agent): Promise<void> {
            const enemy = world.getNearestEntityWhere(agent.bot,
                entity => mc.isHostile(entity as RuntimeEntity), 16);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                await say(agent, `Aaa! A ${enemy.name}!`);
                await execute(this, agent, async () => {
                    await skills.avoidEnemies(agent.bot, {distance:24});
                });
            }
        }
    },

    {
        name: 'self_defense',
        description: 'Attack nearby enemies. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        async update(agent: Agent): Promise<void> {
            const enemy = world.getNearestEntityWhere(agent.bot,
                entity => mc.isHostile(entity as RuntimeEntity), 8);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                await say(agent, `Fighting ${enemy.name}!`);
                await execute(this, agent, async () => {
                    await skills.defendSelf(agent.bot, { range: 8 });
                });
            }
        }
    },

    {
        name: 'hunting',
        description: 'Hunt nearby animals when idle.',
        interrupts: [],
        on: true,
        active: false,
        async update(agent: Agent): Promise<void> {
            const huntable = world.getNearestEntityWhere(agent.bot,
                entity => mc.isHuntable(entity as RuntimeEntity), 8);
            if (huntable && await world.isClearPath(agent.bot, huntable)) {
                await execute(this, agent, async () => {
                    await say(agent, `Hunting ${huntable.name}!`);
                    await skills.attackEntity(agent.bot, huntable);
                });
            }
        }
    },

    {
        name: 'item_collecting',
        description: 'Collect nearby items when idle.',
        interrupts: ['followPlayer'],
        on: true,
        active: false,
        wait: 2,
        prev_item: null as Entity | null,
        noticed_at: -1,
        async update(agent: Agent): Promise<void> {
            const item = world.getNearestEntityWhere(agent.bot, entity => entity.name === 'item', 8);
            const emptySlots = agent.bot.inventory.emptySlotCount();
            if (item && item !== this.prev_item && await world.isClearPath(agent.bot, item) && emptySlots > 1) {
                if (this.noticed_at === -1) {
                    this.noticed_at = Date.now();
                }
                if (Date.now() - this.noticed_at > this.wait * 1000) {
                    await say(agent, 'Picking up item!');
                    this.prev_item = item;
                    await execute(this, agent, async () => {
                        await skills.pickupNearbyItems(agent.bot);
                    });
                    this.noticed_at = -1;
                }
            } else {
                this.noticed_at = -1;
            }
        }
    },

    {
        name: 'torch_placing',
        description: 'Place torches when idle and there are no torches nearby.',
        interrupts: ['followPlayer'],
        on: true,
        active: false,
        cooldown: 5,
        last_place: Date.now(),
        update: async function(agent: Agent): Promise<void> {
            if (world.shouldPlaceTorch(agent.bot)) {
                if (Date.now() - this.last_place < this.cooldown * 1000) return;
                execute(this, agent, async () => {
                    const pos = agent.bot.entity.position;
                    await skills.placeBlock(agent.bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
                }).then();
                this.last_place = Date.now();
            }
        }
    },

    {
        name: 'idle_staring',
        description: 'Animation to look around at entities when idle.',
        interrupts: [],
        on: true,
        active: false,
        staring: false,
        last_entity: null as Entity | null,
        next_change: 0,
        update: async function(agent: Agent): Promise<void> {
            const entity = agent.bot.nearestEntity();
            const entityInView = entity &&
                entity.position.distanceTo(agent.bot.entity.position) < 10 &&
                entity.name !== 'enderman';

            if (entityInView && entity !== this.last_entity) {
                this.staring = true;
                this.last_entity = entity;
                this.next_change = Date.now() + Math.random() * 1000 + 4000;
            }

            if (entityInView && this.staring && entity) {
                const isBaby = entity.type !== 'player' && entity.metadata[16];
                const height = isBaby ? entity.height/2 : entity.height;
                await agent.bot.lookAt(entity.position.offset(0, height, 0));
            }

            if (!entityInView) {
                this.last_entity = null;
            }

            if (Date.now() > this.next_change) {
                this.staring = Math.random() < 0.3;
                if (!this.staring) {
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                    await agent.bot.look(yaw, pitch, false);
                }
                this.next_change = Date.now() + Math.random() * 10000 + 2000;
            }
        }
    },

    {
        name: 'cheat',
        description: 'Use cheats to instantly place blocks and teleport.',
        interrupts: [],
        on: false,
        active: false,
        update: async function(_agent: Agent): Promise<void> { /* do nothing */ }
    }
];

export class ModeController {
    private readonly agent: Agent;
    private readonly modes_list: Mode[];
    private readonly modes_map: Record<string, Mode>;
    public behavior_log: string = '';

    constructor(agent: Agent) {
        this.agent = agent;
        this.modes_list = modes;
        this.modes_map = Object.fromEntries(
            modes.map(mode => [mode.name, mode])
        );
    }

    exists(modeName: string): boolean {
        return modeName in this.modes_map;
    }

    setOn(modeName: string, on: boolean): void {
        if (!this.exists(modeName)) {
            throw new Error(`Mode ${modeName} does not exist`);
        }
        this.modes_map[modeName].on = on;
    }

    isOn(modeName: string): boolean {
        if (!this.exists(modeName)) {
            throw new Error(`Mode ${modeName} does not exist`);
        }
        return this.modes_map[modeName].on;
    }

    pause(modeName: string): void {
        if (!this.exists(modeName)) {
            throw new Error(`Mode ${modeName} does not exist`);
        }
        this.modes_map[modeName].paused = true;
    }

    unpause(modeName: string): void {
        if (!this.exists(modeName)) {
            throw new Error(`Mode ${modeName} does not exist`);
        }
        this.modes_map[modeName].paused = false;
    }

    unPauseAll(): void {
        for (const mode of this.modes_list) {
            if (mode.paused) console.log(`Unpausing mode ${mode.name}`);
            mode.paused = false;
        }
    }

    getMiniDocs(): string {
        return ['Agent Modes:',
            ...this.modes_list.map(mode =>
                `- ${mode.name}(${mode.on ? 'ON' : 'OFF'})`)
        ].join('\n');
    }

    getDocs(): string {
        return ['Agent Modes:',
            ...this.modes_list.map(mode =>
                `- ${mode.name}(${mode.on ? 'ON' : 'OFF'}): ${mode.description}`)
        ].join('\n');
    }

    async update(): Promise<void> {
        if (this.agent.isIdle()) {
            this.unPauseAll();
        }

        for (const mode of this.modes_list) {
            const interruptible = mode.interrupts.includes('all') ||
                mode.interrupts.includes(this.agent.coder.curActionName);

            if (mode.on && !mode.paused && !mode.active &&
                (this.agent.isIdle() || interruptible)) {
                await mode.update(this.agent);
            }

            if (mode.active) break;
        }
    }

    flushBehaviorLog(): string {
        const log = this.behavior_log;
        this.behavior_log = '';
        return log;
    }

    getJson(): Record<string, boolean> {
        return Object.fromEntries(
            this.modes_list.map(mode => [mode.name, mode.on])
        );
    }

    loadJson(json: Record<string, boolean>): void {
        Object.entries(json).forEach(([name, on]) => {
            if (name in this.modes_map) {
                this.modes_map[name].on = on;
            }
        });
    }
}

export function initModes(agent: Agent): void {
    agent.bot.modes = new ModeController(agent);
    const initialModes = agent.prompter.getInitModes();
    if (initialModes) {
        agent.bot.modes.loadJson(initialModes);
    }
}