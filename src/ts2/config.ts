import {MindcraftConfig} from "./types/config";

/**
 * Default configuration settings for the bot system
 */
const config: MindcraftConfig = {
    minecraft_version: "1.20.4",
    host: "127.0.0.1",
    port: 55916,
    auth: "offline",
    profiles: ["./andy.json"],
    load_memory: false,
    init_message: "Say hello world and your name",
    language: "en",
    show_bot_views: false,
    allow_insecure_coding: false,
    code_timeout_mins: 10,
    max_messages: 15,
    max_commands: -1,
    verbose_commands: true,
    narrate_behavior: true,
};

export default config;