import { Settings } from './types/settings';

const settings: Settings = {
    minecraft_version: "1.20.4", // supports up to 1.20.4
    host: "127.0.0.1", // or "localhost", "your.ip.address.here"
    port: 55916,
    auth: "offline", // or "microsoft"

    profiles: [
        "./andy.json",
        // add more profiles here, check ./profiles/ for more than 1 profile will require you to /msg each bot individually
    ],
    load_memory: false, // load memory from previous session
    init_message: "Say hello world and your name", // sends to all on spawn
    language: "en", // translate to/from this language
    show_bot_views: false, // show bot's view in browser at localhost:3000, 3001...
    allow_insecure_coding: false, // allows newAction command and model can write/run code
    code_timeout_mins: 10, // minutes code is allowed to run. -1 for no timeout
    max_messages: 15, // max number of messages to keep in context
    max_commands: -1, // max number of commands to use in a response. -1 for no limit
    verbose_commands: true, // show full command syntax
    narrate_behavior: true, // chat simple automatic actions
} as const;

export default settings;