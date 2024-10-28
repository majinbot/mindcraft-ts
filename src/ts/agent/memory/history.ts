import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { NPCData } from './npc/data';
import settings from '../../settings';
import type { Agent } from './agent';
import type { ChatMessage } from '../types/chat';
import type { HistoryData } from '../types/history';
import type { ModesData } from '../modes';
import type { MemoryBankData } from './memory_bank'

export interface HistoryData {
    name: string;
    memory: string;
    turns: ChatMessage[];
    npc?: NPCData;
    modes?: ModesData;
    memory_bank?: MemoryBankData;
    self_prompt?: string;
  }

export class History {
    private agent: Agent;
    private name: string;
    private memoryFp: string;
    private fullHistoryFp: string | undefined;
    private turns: ChatMessage[] = [];
    private memory: string = '';
    private maxMessages: number;
    private summaryChunkSize: number;

    constructor(agent: Agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memoryFp = `./bots/${this.name}/memory.json`;
        this.maxMessages = settings.maxMessages;
        this.summaryChunkSize = 5;

        mkdirSync(`./bots/${this.name}/histories`, { recursive: true });
    }

    getHistory(): ChatMessage[] {
        return JSON.parse(JSON.stringify(this.turns));
    }

    private async summarizeMemories(turns: ChatMessage[]): Promise<void> {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(turns);

        if (this.memory.length > 500) {
            this.memory = this.memory.slice(0, 500);
            this.memory += '...(Memory truncated to 500 chars. Compress it more next time)';
        }

        console.log("Memory updated to: ", this.memory);
    }

    private appendFullHistory(toStore: ChatMessage[]): void {
        if (this.fullHistoryFp === undefined) {
            const stringTimestamp = new Date().toLocaleString()
                .replace(/[/:]/g, '-')
                .replace(/ /g, '')
                .replace(/,/g, '_');
            this.fullHistoryFp = `./bots/${this.name}/histories/${stringTimestamp}.json`;
            writeFileSync(this.fullHistoryFp, '[]', 'utf8');
        }

        try {
            const data = readFileSync(this.fullHistoryFp, 'utf8');
            const fullHistory = JSON.parse(data) as ChatMessage[];
            fullHistory.push(...toStore);
            writeFileSync(this.fullHistoryFp, JSON.stringify(fullHistory, null, 4), 'utf8');
        } catch (err) {
            console.error(`Error reading ${this.name}'s full history file:`, err);
        }
    }

    async add(name: string, content: string): Promise<void> {
        let role: 'assistant' | 'system' | 'user' = 'assistant';
        
        if (name === 'system') {
            role = 'system';
        } else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }

        this.turns.push({ role, content });

        if (this.turns.length >= this.maxMessages) {
            const chunk = this.turns.splice(0, this.summaryChunkSize);
            while (this.turns.length > 0 && this.turns[0].role === 'assistant') {
                chunk.push(this.turns.shift()!);
            }

            await this.summarizeMemories(chunk);
            this.appendFullHistory(chunk);
        }
    }

    save(): void {
        const data: HistoryData = {
            name: this.name,
            memory: this.memory,
            turns: this.turns
        };

        if (this.agent.npc.data !== null) {
            data.npc = this.agent.npc.data.toObject();
        }

        const modes = this.agent.bot.modes.getJson();
        if (modes !== null) {
            data.modes = modes;
        }

        const memoryBank = this.agent.memoryBank.getJson();
        if (memoryBank !== null) {
            data.memory_bank = memoryBank;
        }

        if (this.agent.selfPrompter.on) {
            data.self_prompt = this.agent.selfPrompter.prompt;
        }

        writeFileSync(this.memoryFp, JSON.stringify(data, null, 4));
    }

    load(): HistoryData | null {
        try {
            const data = readFileSync(this.memoryFp, 'utf8');
            const obj = JSON.parse(data) as HistoryData;
            
            this.memory = obj.memory;
            this.agent.npc.data = NPCData.fromObject(obj.npc);
            
            if (obj.modes) {
                this.agent.bot.modes.loadJson(obj.modes);
            }
            if (obj.memory_bank) {
                this.agent.memoryBank.loadJson(obj.memory_bank);
            }
            
            this.turns = obj.turns;
            return obj;
        } catch (err) {
            console.error(`Error reading ${this.name}'s memory file:`, err);
            return null;
        }
    }

    clear(): void {
        this.turns = [];
        this.memory = '';
    }
}
