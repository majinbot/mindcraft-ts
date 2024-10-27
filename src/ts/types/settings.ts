export interface Settings {
    minecraft_version: string;
    host: string;
    port: number;
    auth: 'offline' | 'microsoft';
    profiles: string[];
    load_memory: boolean;
    init_message: string;
    language: string;
    show_bot_views: boolean;
    allow_insecure_coding: boolean;
    code_timeout_mins: number;
    max_messages: number;
    max_commands: number;
    verbose_commands: boolean;
    narrate_behavior: boolean;
}