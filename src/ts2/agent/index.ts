import {Bot} from 'mineflayer';
import {History} from './history';
import {Coder} from './coder';
import {Prompter} from './prompter';
import {initModes} from './modes';
import {initBot} from '../utils/mcdata';
import {commandExists, containsCommand, executeCommand, isAction, truncCommandMessage} from './commands';
import {MemoryBank} from './memory_bank';
import {SelfPrompter} from './self_prompter';
import {handleEnglishTranslation, handleTranslation} from '../utils/translation';
import {addViewer} from './viewer';
import {AgentSettings} from "../types/agent";
import {IEatUtilOpts} from "mineflayer-auto-eat/dist/new";
import {SaveData} from "./types";
import config from "../config";

// Add missing events to BotEvents
declare module 'mineflayer' {
    interface BotEvents {
        finished_executing: () => void;
        sunrise: () => void;
        noon: () => void;
        sunset: () => void;
        midnight: () => void;
        idle: () => void;
    }
}

export class Agent {
    public bot!: Bot;
    public prompter!: Prompter;
    public history!: History;
    public coder!: Coder;
    public memory_bank!: MemoryBank;
    public self_prompter!: SelfPrompter;
    public name!: string;
    public settings!: AgentSettings;
    private shut_up: boolean = false;

    private running: boolean = false;

    private static readonly IGNORE_MESSAGES: readonly string[] = [
        "Set own game mode to",
        "Set the time to",
        "Set the difficulty to",
        "Teleported ",
        "Set the weather to",
        "Gamerule "
    ] as const;

    async start(
        profile_fp: string,
        loadMem: boolean = false,
        initMessage: string | null = null,
        countId: number = 0
    ): Promise<void> {
        this.prompter = new Prompter(this, profile_fp);
        // Initialize settings by combining config and profile
        this.settings = {
            max_commands: config.max_commands,
            verbose_commands: config.verbose_commands,
            narrate_behavior: config.narrate_behavior,
            max_messages: config.max_messages,
            code_timeout_mins: config.code_timeout_mins,
            allow_unsafe_coding: config.allow_insecure_coding,
            profiles: [this.prompter.profile], // Add current profile
        };
        this.name = this.prompter.getName();
        this.history = new History(this);
        this.coder = new Coder(this);
        this.memory_bank = new MemoryBank();
        this.self_prompter = new SelfPrompter(this);

        // TODO: fix await this.prompter.initExamples();

        console.log('Logging in...');
        this.bot = initBot(this.name);
        initModes(this);

        let saveData: SaveData | null = null;
        if (loadMem) {
            saveData = this.history.load();
        }

        this.bot.once('spawn', async () => {
            addViewer(this.bot, countId);
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`${this.name} spawned.`);
            this.coder.clear();

            const eventName = this.settings.profiles.length > 1 ? 'whisper' : 'chat';
            this.bot.on(eventName, async (username: string, message: string) => {
                if (username === this.name ||
                    Agent.IGNORE_MESSAGES.some(m => message.startsWith(m))) return;

                const translation = await handleEnglishTranslation(message);
                console.log('received message from', username, ':', translation);
                this.shut_up = false;
                await this.handleMessage(username, translation);
            });

            this.initAutoEat();

            if (saveData?.self_prompt) {
                const prompt = saveData.self_prompt;
                await this.history.add('system', prompt);
                this.self_prompter.start(prompt);
            } else if (initMessage) {
                await this.handleMessage('system', initMessage, 2);
            } else {
                const translation = await handleTranslation(`Hello world! I am ${this.name}`);
                this.bot.chat(translation);
                this.bot.emit('finished_executing');
            }

            this.startEvents();
        });
    }

    private initAutoEat(): void {
        // Apply options to the autoEat instance
        this.bot.autoEat.options = {
            bannedFood: [],
            checkOnItemPickup: false,
            eatingTimeout: 0,
            equipOldItem: false,
            healthThreshold: 0,
            ignoreInventoryCheck: false,
            offhand: false,
            priority: "foodPoints",
            startAt: 0
            //priority: 'foodPoints',
            //minHunger: 14,
            // bannedFood: [
            //     "rotten_flesh",
            //     "spider_eye",
            //     "poisonous_potato",
            //     "pufferfish",
            //     "chicken"
            // ]
        };
        this.bot.autoEat.enable()
        // Enable auto eating
        //this.bot.autoEat.enableAuto();
    }

    async cleanChat(message: string, translateUpTo: number = -1): Promise<void> {
        let toTranslate = translateUpTo !== -1 ?
            message.substring(0, translateUpTo) :
            message;

        let remaining = translateUpTo !== -1 ?
            message.substring(translateUpTo) :
            '';

        const translated = await handleTranslation(toTranslate);
        message = `${translated.trim()} ${remaining}`.replace(/\n/g, ' ');
        this.bot.chat(message);
    }

    shutUp(): void {
        this.shut_up = true;
        if (this.self_prompter.on) {
            void this.self_prompter.stop(false);
        }
    }

    async handleMessage(
        source: string,
        message: string,
        maxResponses: number | null = null
    ): Promise<boolean> {
        let usedCommand = false;
        maxResponses = maxResponses ??
            (this.settings.max_commands === -1 ?
                Infinity : this.settings.max_commands);

        const selfPrompt = source === 'system' || source === this.name;

        if (!selfPrompt) {
            const userCommandName = containsCommand(message);
            if (userCommandName) {
                if (!commandExists(userCommandName)) {
                    this.bot.chat(`Command '${userCommandName}' does not exist.`);
                    return false;
                }

                this.bot.chat(`*${source} used ${userCommandName.substring(1)}*`);

                if (userCommandName === '!newAction') {
                    await this.history.add(source, message);
                }

                const executeRes = await executeCommand(this, message);
                if (executeRes) {
                    await this.cleanChat(executeRes);
                }
                return true;
            }
        }

        const checkInterrupt = () =>
            this.self_prompter.shouldInterrupt(selfPrompt) || this.shut_up;

        const behaviorLog = this.bot.modes.flushBehaviorLog();
        if (behaviorLog.trim()) {
            const MAX_LOG = 500;
            const truncatedLog = behaviorLog.length > MAX_LOG ?
                '...' + behaviorLog.slice(-MAX_LOG) :
                behaviorLog;

            const formattedLog = 'Recent behaviors log: \n' +
                truncatedLog.substring(truncatedLog.indexOf('\n'));

            await this.history.add('system', formattedLog);
        }

        await this.history.add(source, message);
        this.history.save();

        if (!selfPrompt && this.self_prompter.on) {
            maxResponses = 1;
        }

        for (let i = 0; i < maxResponses; i++) {
            if (checkInterrupt()) break;

            const history = this.history.getHistory();
            const res = await this.prompter.promptConvo(history);
            const commandName = containsCommand(res);

            if (commandName) {
                console.log(`Full response: "${res}"`);
                const truncated = truncCommandMessage(res);
                await this.history.add(this.name, truncated);

                if (!commandExists(commandName)) {
                    await this.history.add('system', `Command ${commandName} does not exist.`);
                    console.warn('Agent hallucinated command:', commandName);
                    continue;
                }

                if (commandName === '!stopSelfPrompt' && selfPrompt) {
                    await this.history.add('system', 'Cannot stopSelfPrompt unless requested by user.');
                    continue;
                }

                if (checkInterrupt()) break;

                this.self_prompter.handleUserPromptedCmd(
                    selfPrompt,
                    isAction(commandName)
                );

                if (this.settings.verbose_commands) {
                    await this.cleanChat(truncated, truncated.indexOf(commandName));
                } else {
                    const preMessage = truncated.substring(0, truncated.indexOf(commandName)).trim();
                    const chatMessage = preMessage ?
                        `${preMessage} *used ${commandName.substring(1)}*` :
                        `*used ${commandName.substring(1)}*`;
                    await this.cleanChat(chatMessage);
                }

                const executeRes = await executeCommand(this, truncated);
                console.log('Agent executed:', commandName, 'and got:', executeRes);
                usedCommand = true;

                if (executeRes) {
                    await this.history.add('system', executeRes);
                } else {
                    break;
                }
            } else {
                await this.history.add(this.name, res);
                await this.cleanChat(res);
                console.log('Purely conversational response:', res);
                break;
            }

            this.history.save();
        }

        this.bot.emit('finished_executing');
        return usedCommand;
    }

    private startEvents(): void {
        this.initTimeEvents();
        this.initHealthTracking();
        this.initErrorHandling();
        this.startUpdateLoop();
        this.bot.emit('idle');
    }

    private initTimeEvents(): void {
        this.bot.on('time', () => {
            const timeOfDay = this.bot.time.timeOfDay;
            if (timeOfDay === 0) this.bot.emit('sunrise');
            else if (timeOfDay === 6000) this.bot.emit('noon');
            else if (timeOfDay === 12000) this.bot.emit('sunset');
            else if (timeOfDay === 18000) this.bot.emit('midnight');
        });
    }

    private initHealthTracking(): void {
        let prevHealth = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;

        this.bot.on('health', () => {
            if (this.bot.health < prevHealth) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prevHealth - this.bot.health;
            }
            prevHealth = this.bot.health;
        });
    }

    private initErrorHandling(): void {
        this.bot.on('error', (err: Error) => {
            console.error('Error event!', err);
        });

        this.bot.on('end', (reason: string) => {
            console.warn('Bot disconnected! Killing agent process.', reason);
            this.cleanKill('Bot disconnected! Killing agent process.');
        });

        this.bot.on('death', () => {
            this.coder.cancelResume();
            void this.coder.stop();
        });

        this.bot.on('kicked', (reason: string) => {
            console.warn('Bot kicked!', reason);
            this.cleanKill('Bot kicked! Killing agent process.');
        });

        this.bot.on('messagestr', async (message: string, _: unknown, jsonMsg: any) => {
            if (jsonMsg.translate?.startsWith('death') &&
                message.startsWith(this.name)) {
                console.log('Agent died:', message);
                await this.handleMessage(
                    'system',
                    `You died with the final message: '${message}'. Previous actions were stopped and you have respawned. Notify the user and perform any necessary actions.`
                );
            }
        });

        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop();
            this.bot.modes.unPauseAll();
            void this.coder.executeResume();
        });
    }

    async update(delta: number): Promise<void> {
        await this.bot.modes.update();
        this.self_prompter.update(delta);
    }

    isIdle(): boolean {
        return !this.coder.isExecuting && !this.coder.isGenerating;
    }

    /**
     * Check if the agent is in quiet mode
     */
    public isQuiet(): boolean {
        return this.shut_up;
    }

    private startUpdateLoop(): void {
        const INTERVAL = 300;
        let last = Date.now();
        this.running = true;

        // Store the interval handle so we can clear it during cleanup
        const updateLoop = async () => {
            try {
                while (this.running) {
                    const start = Date.now();
                    await this.update(start - last);

                    const remaining = INTERVAL - (Date.now() - start);
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, remaining));
                    }

                    last = start;

                    // Check if bot was disconnected or process is exiting
                    if (!this.bot.entity || process.exitCode !== undefined) {
                        this.running = false;
                        break;
                    }
                }
            } catch (err) {
                console.error('Error in update loop:', err);
                this.cleanKill('Error in update loop, shutting down...');
            }
        };

        // Start the update loop
        void updateLoop();
    }

    // Method to cleanly stop the update loop
    public stopUpdateLoop(): void {
       this.running = false;
    }

    // Stop the loop and save up
    public cleanKill(msg: string = 'Killing agent process...'): void {
        this.stopUpdateLoop();
        void this.history.add('system', msg);
        this.bot.chat('Goodbye world.');
        this.history.save();
        process.exit(1);
    }
}