/**
 * Shared type definitions used across multiple modules
 */

import {ModelConfig} from "../types/models";

/**
 * Represents a location in 3D space as [x, y, z]
 */
export type Location = [number, number, number];

export interface HistoryTurn {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface SaveData {
    name: string;
    memory: string;
    turns: HistoryTurn[];
    modes?: Record<string, boolean>;
    memory_bank?: Record<string, Location>;
    npc?: Record<string, unknown>;
    self_prompt?: string;
}

/**
 * Profile configuration for an agent
 */
export interface Profile {
    name: string;
    model: ModelConfig | string;
    embedding?: ModelConfig | string;
    cooldown?: number;
    max_tokens?: number;
    modes?: Record<string, boolean>;
    conversation_examples: string[];
    coding_examples: string[];
    conversing: string;
    coding: string;
    saving_memory: string;
    goal_setting: string;
}
