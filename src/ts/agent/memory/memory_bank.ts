export interface MemoryBankData {
    [key: string]: [number, number, number];
  }

export class MemoryBank {
    private memory: MemoryBankData = {};

    rememberPlace(name: string, x: number, y: number, z: number): void {
        this.memory[name] = [x, y, z];
    }

    recallPlace(name: string): [number, number, number] | undefined {
        return this.memory[name];
    }

    getJson(): MemoryBankData {
        return this.memory;
    }

    loadJson(json: MemoryBankData): void {
        this.memory = json;
    }

    getKeys(): string {
        return Object.keys(this.memory).join(', ');
    }
}
