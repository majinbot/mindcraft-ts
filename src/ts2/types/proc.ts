/**
 * @file Agent process type definitions
 * @description Shared types for agent process management and initialization
 */

/**
 * Options for starting an agent process
 */
export interface AgentStartOptions {
    /** Path to the agent's profile file */
    profile: string;
    /** Whether to load memory from previous sessions */
    loadMemory?: boolean;
    /** Initial message to send to the agent */
    initMessage?: string | null;
    /** Identifier for multi-agent scenarios */
    countId?: number;
}

/**
 * Command line arguments for agent initialization
 */
export interface AgentArguments {
    /** Path to the agent's profile file */
    profile: string;
    /** Whether to load memory from previous sessions */
    loadMemory: boolean;
    /** Initial message to send to the agent */
    initMessage?: string;
    /** Identifier for multi-agent scenarios */
    countId: number;
}

/**
 * Internal context for process management
 * @internal
 */
export interface ProcessContext {
    /** Path to the agent's profile */
    profile: string;
    /** Timestamp of last restart */
    lastRestart: number;
    /** Agent identifier */
    countId: number;
}