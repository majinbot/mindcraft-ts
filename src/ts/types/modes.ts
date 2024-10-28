import type { Agent } from '../agent';
import type { Entity } from 'prismarine-entity';
import type { Vec3 } from 'vec3';

export interface Mode {
    name: string;
    description: string;
    interrupts: string[];
    on: boolean;
    active: boolean;
    paused?: boolean;
    update: (agent: Agent) => Promise<void>;
    [key: string]: any; // For mode-specific properties
}

export interface ModesData {
    [modeName: string]: boolean;
}

export interface ModeExecuteReturn {
    success: boolean;
    message: string | null;
    interrupted: boolean;
    timedout: boolean;
}

export interface Block {
    name: string;
    position: Vec3;
}

export interface EntityMetadata {
    [key: number]: any;
}

export interface GameEntity extends Entity {
    name: string;
    height: number;
    position: Vec3;
}
