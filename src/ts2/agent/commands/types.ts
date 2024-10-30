import { Agent } from '../index';

// Basic parameter types supported by commands
export type CommandParamType = 'int' | 'float' | 'boolean' | 'string' | 'BlockName' | 'ItemName';

// Parameter definition interface
export interface CommandParameter {
    type: CommandParamType;
    description: string;
    domain?: [number, number, string?]; // [min, max, intervalType]
}

// Command parameters dictionary
export interface CommandParameters {
    [key: string]: CommandParameter;
}

// Base interface for all commands
export interface Command {
    name: string;
    description: string;
    params?: CommandParameters;
    perform: (agent: Agent, ...args: any[]) => Promise<string | void> | string | void;
}

// Return type for parsed commands
export interface ParsedCommand {
    commandName: string;
    args: any[];
}

// Interval types for numeric parameter validation
export type IntervalType = '[]' | '[)' | '(]' | '()';

// Error types for command validation
export type CommandError =
    | 'FORMAT_ERROR'
    | 'UNKNOWN_COMMAND'
    | 'PARAM_COUNT_MISMATCH'
    | 'PARAM_TYPE_ERROR'
    | 'PARAM_DOMAIN_ERROR'
    | 'INVALID_BLOCK'
    | 'INVALID_ITEM';

export interface CommandResult<T> {
    success: boolean;
    data?: T;
    error?: CommandError;
    message?: string;
}