/**
 * @file Configuration settings for the Mindcraft bot system
 * @description Defines the core configuration interface and default settings for the bot system.
 */

/**
 * Represents the authentication types supported by the system
 */
export type AuthType = 'offline' | 'microsoft';

/**
 * Represents the complete configuration interface for a mindcraft bot
 */
export interface MindcraftConfig {
    /** Minecraft version to target (currently supports up to 1.20.4) */
    minecraft_version: string;

    /** Server host address */
    host: string;

    /** Server port number */
    port: number;

    /** Authentication method to use */
    auth: AuthType;

    /** Array of paths to bot profile JSON files */
    profiles: string[];

    /** Whether to load memory from previous session */
    load_memory: boolean;

    /** Message to send when bot spawns */
    init_message: string;

    /**
     * Target language for translation
     * @see https://cloud.google.com/translate/docs/languages for supported languages
     */
    language: string;

    /** Whether to show bot's view in browser (localhost:3000, 3001...) */
    show_bot_views: boolean;

    /**
     * Whether to allow the model to write/execute code
     * @warning Enable at own risk
     */
    allow_insecure_coding: boolean;

    /**
     * Timeout for code execution in minutes
     * @default 10
     * @remarks Set to -1 for no timeout
     */
    code_timeout_mins: number;

    /**
     * Maximum number of messages to keep in context
     * @default 15
     */
    max_messages: number;

    /**
     * Maximum number of commands to use in a response
     * @default -1 (unlimited)
     */
    max_commands: number;

    /** Whether to show full command syntax */
    verbose_commands: boolean;

    /** Whether to chat simple automatic actions */
    narrate_behavior: boolean;
}
