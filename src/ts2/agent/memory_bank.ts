import {Location} from "./types";

export class MemoryBank {
    private memory: Record<string, Location> = {};

    rememberPlace(name: string, x: number, y: number, z: number): void {
        this.memory[name] = [x, y, z];
    }

    recallPlace(name: string): Location | undefined {
        return this.memory[name];
    }

    getJson(): Record<string, Location> {
        return { ...this.memory };
    }

    loadJson(json: Record<string, Location>): void {
        this.memory = { ...json };
    }

    getKeys(): string {
        return Object.keys(this.memory).join(', ');
    }
}