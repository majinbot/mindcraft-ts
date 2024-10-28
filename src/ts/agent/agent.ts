import { History } from './history';
import { Coder } from './coder';
import { Prompter } from './prompter';
import { initModes } from './modes';
import { initBot } from '../utils/mcdata';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction } from './commands';
import { NPCController } from './npc/controller';
import { MemoryBank } from './memory_bank';
import { SelfPrompter } from './self_prompter';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator';
import { addViewer } from './viewer';
import settings from '../settings';
import type { AgentBot, AgentOptions } from '../types/agent';
import type { JsonMessage } from '../types/mc/chat';

/**
 * Main agent class that coordinates all bot functionality
 */
export class Agent {
    public bot!: AgentBot;
    public name!: string;
    public prompter!: Prompter;
    public history!: History;
    public coder!: Coder;
    public npc!: NPCController;
    public memoryBank!: MemoryBank;
    public selfPrompter!: SelfPrompter;
    private shutUp: boolean = false;

    /**
     * Initializes and starts the agent
     */
    async start({
        profileFp,
        loadMem = false,
        initMessage = null,
        countId = 0
    }: AgentOptions): Promise<void> {
        // Initialize core components
        this.prompter = new Prompter(this, profileFp);
        this.name = this.prompter.getName();
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCController(this);
        this.memoryBank = new MemoryBank();
        this.selfPrompter = new SelfPrompter(this);

        await this.prompter.initExamples();

        console.log('Logging in...');
        this.bot = initBot({
            username: this.name,
            host: settings.host,
            port: settings.port,
            version: settings.version,
            auth: settings.auth
        }) as AgentBot;

        initModes(this);

        // Load saved memory if requested
        const saveData = loadMem ? this.history.load() : null;

        // Handle spawn event
        this.bot.once('spawn', async () => {
            addViewer(this.bot, countId);

            // Wait for stats to initialize
            await new Promise((resolve) => setTimeout(resolve, 1000));

            console.log(`${this.name} spawned.`);
            this.coder.clear();

            this.initMessageHandling();
            this.initAutoEat();

            // Handle saved state or initial message
            if (saveData?.selfPrompt) {
                const prompt = saveData.selfPrompt;
                this.history.add('system', prompt);
                this.selfPrompter.start(prompt);
            } else if (initMessage) {
                this.handleMessage('system', initMessage, 2);
            } else {
                const translation = await handleTranslation(`Hello world! I am ${this.name}`);
                this.bot.chat(translation);
                this.bot.emit('finished_executing');
            }

            this.startEvents();
        });
    }

    /**
     * Initialize message handling system
     */
    private initMessageHandling(): void {
        const ignoreMessages = [
            "Set own game mode to",
            "Set the time to",
            "Set the difficulty to",
            "Teleported ",
            "Set the weather to",
            "Gamerule "
        ];

        const eventName = settings.profiles.length > 1 ? 'whisper' : 'chat';

        this.bot.on(eventName, async (username: string, message: string) => {
            if (username === this.name) return;
            if (ignoreMessages.some((m) => message.startsWith(m))) return;

            const translation = await handleEnglishTranslation(message);
            console.log('received message from', username, ':', translation);

            this.shutUp = false;
            this.handleMessage(username, translation);
        });
    }

    /**
     * Initialize auto-eat configuration
     */
    private initAutoEat(): void {
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
        };
    }

    /**
     * Cleans and translates chat messages before sending
     */
    async cleanChat(message: string, translateUpTo: number = -1): Promise<void> {
        let toTranslate = message;
        let remaining = '';
        
        if (translateUpTo !== -1) {
            toTranslate = toTranslate.substring(0, translateUpTo);
            remaining = message.substring(translateUpTo);
        }
        
        const translatedMessage = (await handleTranslation(toTranslate)).trim() + " " + remaining;
        // Replace newlines with spaces to avoid spam filters
        const cleanedMessage = translatedMessage.replaceAll('\n', ' ');
        return this.bot.chat(cleanedMessage);
    }

    /**
     * Stops the agent from talking and self-prompting
     */
    setShutUp(): void {
        this.shutUp = true;
        if (this.selfPrompter.on) {
            this.selfPrompter.stop(false);
        }
    }

    /**
     * Handles incoming messages and executes commands
     */
    async handleMessage(source: string, message: string, maxResponses: number | null = null): Promise<boolean> {
        let usedCommand = false;
        
        if (maxResponses === null) {
            maxResponses = settings.maxCommands === -1 ? Infinity : settings.maxCommands;
        }
        if (maxResponses === -1) {
            maxResponses = Infinity;
        }

        let responses = 0;
        while (responses < maxResponses) {
            responses++;

            let res: string;
            if (isAction(message)) {
                res = await this.prompter.promptCoding([{
                    role: source === this.name ? 'assistant' : 'user',
                    content: message
                }]);
            } else {
                res = await this.prompter.promptConvo([{
                    role: source === this.name ? 'assistant' : 'user',
                    content: message
                }]);
            }

            if (!res) break;

            if (containsCommand(res)) {
                const commandName = truncCommandMessage(res);
                
                if (!commandExists(commandName)) {
                    this.history.add('system', `Command ${commandName} does not exist`);
                    continue;
                }

                // Handle command output
                if (settings.verboseCommands) {
                    this.cleanChat(res);
                } else {
                    const preMessage = res.substring(0, res.indexOf(commandName)).trim();
                    let chatMessage = `*used ${commandName.substring(1)}*`;
                    if (preMessage.length > 0) {
                        chatMessage = `${preMessage} ${chatMessage}`;
                    }
                    this.cleanChat(chatMessage);
                }

                const executeRes = await executeCommand(this, res);
                console.log('Agent executed:', commandName, 'and got:', executeRes);
                usedCommand = true;

                if (executeRes) {
                    this.history.add('system', executeRes);
                } else {
                    break;
                }
            } else {
                // Conversational response
                this.history.add(this.name, res);
                this.cleanChat(res);
                console.log('Purely conversational response:', res);
                break;
            }
            this.history.save();
        }

        this.bot.emit('finished_executing');
        return usedCommand;
    }

    /**
     * Initializes and starts all event handlers
     */
    startEvents(): void {
        // Custom time events
        this.bot.on('time', () => {
            const timeOfDay = this.bot.time.timeOfDay;
            if (timeOfDay === 0) this.bot.emit('sunrise');
            else if (timeOfDay === 6000) this.bot.emit('noon');
            else if (timeOfDay === 12000) this.bot.emit('sunset');
            else if (timeOfDay === 18000) this.bot.emit('midnight');
        });

        // Health tracking
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

        // Error handling
        this.bot.on('error', (err: Error) => {
            console.error('Error event!', err);
        });

        this.bot.on('end', (reason: string) => {
            console.warn('Bot disconnected! Killing agent process.', reason);
            this.cleanKill('Bot disconnected! Killing agent process.');
        });

        this.bot.on('death', () => {
            this.coder.cancelResume();
            this.coder.stop();
        });

        this.bot.on('kicked', (reason: string) => {
            console.warn('Bot kicked!', reason);
            this.cleanKill('Bot kicked! Killing agent process.');
        });

        this.bot.on('messagestr', async (message: string, _: string, jsonMsg: JsonMessage) => {
            if (jsonMsg.translate?.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                await this.handleMessage('system', 
                    `You died with the final message: '${message}'. Previous actions were stopped and you have respawned. Notify the user and perform any necessary actions.`
                );
            }
        });

        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop();
            this.bot.modes.unPauseAll();
            this.coder.executeResume();
        });

        // Initialize NPC controller
        this.npc.init();

        // Start update loop
        const INTERVAL = 300;
        let last = Date.now();
        
        setTimeout(async () => {
            while (true) {
                const start = Date.now();
                await this.update(start - last);
                const remaining = INTERVAL - (Date.now() - start);
                
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
                last = start;
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    /**
     * Updates the agent's modes and self-prompter
     */
    async update(delta: number): Promise<void> {
        await this.bot.modes.update();
        await this.selfPrompter.update(delta);
    }

    /**
     * Checks if the agent is currently idle
     */
    isIdle(): boolean {
        return !this.coder.executing && !this.coder.generating;
    }

    /**
     * Cleanly terminates the agent process
     */
    cleanKill(msg: string = 'Killing agent process...'): void {
        this.history.add('system', msg);
        this.bot.chat('Goodbye world.');
        this.history.save();
        process.exit(1);
    }
}
