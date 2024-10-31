import {Bot as MineflayerBot} from 'mineflayer';
import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block';
import { Window } from 'prismarine-windows';
import {PVP} from "mineflayer-pvp/lib/PVP";
import {EatUtil} from "mineflayer-auto-eat/dist/new";
import {Entity} from "prismarine-entity";
import {Pathfinder} from 'mineflayer-pathfinder';
import {Profile} from "../agent/types";

export interface AgentSettings {
    max_commands: number;
    verbose_commands: boolean;
    narrate_behavior: boolean;
    max_messages: number;
    code_timeout_mins: number;
    profiles: Profile[];
    allow_unsafe_coding: boolean;
}

// Core type augmentations for the Bot interface
declare module 'mineflayer' {
    interface Bot extends MineflayerBot {
        // Custom core properties
        output: string;
        interrupt_code: boolean;
        lastDamageTime: number;
        lastDamageTaken: number;

        // Mode management
        modes: {
            behavior_log: string;
            pause(mode: string): void;
            unpause(mode: string): void;
            unPauseAll(): void;
            isOn(mode: string): boolean;
            setOn(mode: string, on: boolean): void;
            exists(mode: string): boolean;
            flushBehaviorLog(): string;
            update(): Promise<void>;
            getJson(): Record<string, boolean>;
            loadJson(json: Record<string, boolean>): void;
            getDocs(): string;
            getMiniDocs(): string;
        };

        // Inventory and item handling enhancements
        inventory: Window<StorageEvents>,

        // Location and movement
        entity: Entity

        // Time and game state
        time: Time

        // Plugin integrations
        pathfinder: Pathfinder

        pvp: PVP

        collectBlock: {
            collect(block: Block | Block[], options?: CollectOptions): Promise<void>;
            cancelTask(): Promise<void>;
        };

        autoEat: EatUtil
        armorManager: {
            equipAll(): Promise<void>;
        };

        // Core actions
        emit(event: string, ...args: any[]): boolean;
    }
}

// Core interfaces for the bot's operation
export interface CollectOptions {
    targetCount?: number;
    rootPosition?: Vec3;
    maxDistance?: number;
    processBlocksWhileCollecting?: boolean;
}

export interface ModeConfig {
    name: string;
    description: string;
    interrupts: string[];
    on: boolean;
    active: boolean;
    paused?: boolean;
    update: (agent: any) => Promise<void>;
}

export interface CodeExecutionResult {
    success: boolean;
    message: string | null;
    interrupted: boolean;
    timedout: boolean;
}

// Custom error types for better error handling
export class AgentError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
        this.name = 'AgentError';
    }
}

export class CodeExecutionError extends AgentError {
    constructor(message: string) {
        super(message, 'CODE_EXECUTION_ERROR');
        this.name = 'CodeExecutionError';
    }
}

// Utility type helpers
export type ItemName = string;
export type BlockName = string;
export type ResourceName = ItemName | BlockName;

export interface Position {
    x: number;
    y: number;
    z: number;
}
