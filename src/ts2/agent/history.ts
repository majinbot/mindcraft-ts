import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { Agent } from './index';
import {HistoryTurn, SaveData} from "./types";

export class History {
    private readonly agent: Agent;
    private readonly name: string;
    private readonly memory_fp: string;
    private full_history_fp?: string;
    private turns: HistoryTurn[] = [];
    memory: string = '';
    private readonly max_messages: number;
    private readonly summary_chunk_size: number = 5;

    constructor(agent: Agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.max_messages = agent.settings.max_messages;

        mkdirSync(`./bots/${this.name}/histories`, { recursive: true });
    }

    getHistory(): HistoryTurn[] {
        return JSON.parse(JSON.stringify(this.turns));
    }

    private async summarizeMemories(turns: HistoryTurn[]): Promise<void> {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(turns);

        if (this.memory.length > 500) {
            this.memory = this.memory.slice(0, 500) +
                '...(Memory truncated to 500 chars. Compress it more next time)';
        }

        console.log("Memory updated to: ", this.memory);
    }

    private appendFullHistory(toStore: HistoryTurn[]): void {
        if (!this.full_history_fp) {
            const timestamp = new Date().toLocaleString()
                .replace(/[/:]/g, '-')
                .replace(/ /g, '')
                .replace(/,/g, '_');
            this.full_history_fp = `./bots/${this.name}/histories/${timestamp}.json`;
            writeFileSync(this.full_history_fp, '[]', 'utf8');
        }

        try {
            const data = readFileSync(this.full_history_fp, 'utf8');
            const fullHistory = JSON.parse(data) as HistoryTurn[];
            fullHistory.push(...toStore);
            writeFileSync(this.full_history_fp, JSON.stringify(fullHistory, null, 4), 'utf8');
        } catch (err) {
            console.error(
                `Error reading ${this.name}'s full history:`,
                err instanceof Error ? err.message : err
            );
        }
    }

    async add(name: string, content: string): Promise<void> {
        const role: HistoryTurn['role'] = name === 'system' ? 'system' :
            name === this.name ? 'assistant' : 'user';

        if (role === 'user') {
            content = `${name}: ${content}`;
        }

        this.turns.push({ role, content });

        if (this.turns.length >= this.max_messages) {
            const chunk = this.turns.splice(0, this.summary_chunk_size);

            // Keep chaining assistant messages to the chunk
            while (this.turns.length > 0 && this.turns[0].role === 'assistant') {
                const assistantTurn = this.turns.shift();
                if (assistantTurn) {
                    chunk.push(assistantTurn);
                }
            }

            await this.summarizeMemories(chunk);
            this.appendFullHistory(chunk);
        }
    }

    save(): void {
        const data: SaveData = {
            name: this.name,
            memory: this.memory,
            turns: this.turns
        };

        const modes = this.agent.bot.modes.getJson();
        if (modes) {
            data.modes = modes;
        }

        // Get memory bank data with proper typing
        const memoryBank = this.agent.memory_bank.getJson();
        if (memoryBank) {
            data.memory_bank = memoryBank;
        }

        if (this.agent.self_prompter.on) {
            data.self_prompt = this.agent.self_prompter.prompt;
        }

        writeFileSync(this.memory_fp, JSON.stringify(data, null, 4));
    }

    load(): SaveData | null {
        try {
            const data = readFileSync(this.memory_fp, 'utf8');
            const obj = JSON.parse(data) as SaveData;

            this.memory = obj.memory;
            this.turns = obj.turns;

            if (obj.modes) {
                this.agent.bot.modes.loadJson(obj.modes);
            }

            // Validate memory bank data before loading
            if (obj.memory_bank && this.isValidMemoryBank(obj.memory_bank)) {
                this.agent.memory_bank.loadJson(obj.memory_bank);
            }

            return obj;
        } catch (err) {
            console.error(
                `Error reading ${this.name}'s memory:`,
                err instanceof Error ? err.message : err
            );
            return null;
        }
    }

    /**
     * Type guard to validate memory bank data
     */
    private isValidMemoryBank(data: Record<string, unknown>): data is Record<string, Location> {
        return Object.values(data).every(value => {
            if (!Array.isArray(value)) return false;
            if (value.length !== 3) return false;
            return value.every(n => typeof n === 'number');
        });
    }

    clear(): void {
        this.turns = [];
        this.memory = '';
    }

    /**
     * Get the current memory string
     */
    get currentMemory(): string {
        return this.memory;
    }
}