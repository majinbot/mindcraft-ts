import type { ExtendedBot } from '../mc/player/bot';
import type { ModeController } from './modes';

export interface AgentBot extends ExtendedBot {
    modes: ModeController;
    autoEat: {
        options: {
            priority: string;
            startAt: number;
            bannedFood: string[];
        };
    };
    lastDamageTime: number;
    lastDamageTaken: number;
}

export interface AgentOptions {
    profileFp: string;
    loadMem?: boolean;
    initMessage?: string | null;
    countId?: number;
}
