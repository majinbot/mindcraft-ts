import type { Agent } from '../../agent';

export type ParamType = 'string' | 'int' | 'float' | 'boolean' | 'BlockName' | 'ItemName';

export interface CommandParam {
    type: ParamType;
    description: string;
    domain?: [number, number, string?]; // For numeric types: [min, max, intervalType]
}

export interface Command {
    name: string;
    description: string;
    params?: Record<string, CommandParam>;
    perform: (agent: Agent, ...args: any[]) => Promise<string | void> | string | void;
}

export interface ParsedCommand {
    commandName: string;
    args?: any[];
}

// Type guard for numeric param types
export function isNumericType(type: ParamType): boolean {
    return type === 'int' || type === 'float';
}

// Type translations for documentation
export const TYPE_TRANSLATIONS: Record<ParamType, string> = {
    float: 'number',
    int: 'number',
    BlockName: 'string',
    ItemName: 'string',
    boolean: 'bool',
    string: 'string'
};