import { getItemId } from '../../mc/player/items';
import { getBlockId } from '../../mc/world/blocks';
import type { Command, CommandParam, ParsedCommand } from '../../types/mc/commands';
import type { McDataContext } from '../../mc/types';

export const COMMAND_REGEX = /!(\w+)(?:\(((?:[^)(]+|'[^']*'|"[^"]*")*)\))?/;
export const COMMAND_ARG_REGEX = /(?:"[^"]*"|'[^']*'|[^,])+/g;

export function containsCommand(message: string): string | null {
    const commandMatch = message.match(COMMAND_REGEX);
    return commandMatch ? `!${commandMatch[1]}` : null;
}

export function truncateCommandMessage(message: string): string {
    const commandMatch = message.match(COMMAND_REGEX);
    return commandMatch 
        ? message.substring(0, commandMatch.index! + commandMatch[0].length)
        : message;
}

function parseBoolean(input: string): boolean | null {
    switch(input.toLowerCase()) {
        case 'false':
        case 'f':
        case '0':
        case 'off':
            return false;
        case 'true':
        case 't':
        case '1':
        case 'on':
            return true;
        default:
            return null;
    }
}

function checkInInterval(
    value: number,
    lowerBound: number,
    upperBound: number,
    endpointType: string = '[)'
): boolean {
    switch (endpointType) {
        case '[)': return lowerBound <= value && value < upperBound;
        case '()': return lowerBound < value && value < upperBound;
        case '(]': return lowerBound < value && value <= upperBound;
        case '[]': return lowerBound <= value && value <= upperBound;
        default: throw new Error(`Invalid interval type: ${endpointType}`);
    }
}

export function parseCommandMessage(
    message: string, 
    commandMap: Record<string, Command>,
    ctx: McDataContext
): string | ParsedCommand {
    const commandMatch = message.match(COMMAND_REGEX);
    if (!commandMatch) return 'Command is incorrectly formatted';

    const commandName = `!${commandMatch[1]}`;
    const command = commandMap[commandName];
    if (!command) return `${commandName} is not a command.`;

    const args = commandMatch[2] ? commandMatch[2].match(COMMAND_ARG_REGEX) || [] : [];
    const params = command.params ? Object.values(command.params) : [];
    const paramNames = command.params ? Object.keys(command.params) : [];

    if (args.length !== params.length) {
        return `Command ${command.name} was given ${args.length} args, but requires ${params.length} args.`;
    }

    const parsedArgs = args.map((arg, i) => {
        const param = params[i];
        let value = arg.trim();

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // Handle param=value syntax
        if (value.includes('=')) {
            value = value.split('=')[1].trim();
        }

        return validateAndConvertParam(value, param, paramNames[i], commandName, ctx);
    });

    // Check for validation errors
    const error = parsedArgs.find(arg => typeof arg === 'string');
    if (error) return error as string;

    return { commandName, args: parsedArgs };
}

function validateAndConvertParam(
    value: string,
    param: CommandParam,
    paramName: string,
    commandName: string,
    ctx: McDataContext
): any | string {
    let converted: any;

    switch(param.type) {
        case 'int':
            converted = parseInt(value);
            if (isNaN(converted)) {
                return `Error: Param '${paramName}' must be an integer`;
            }
            break;
        case 'float':
            converted = parseFloat(value);
            if (isNaN(converted)) {
                return `Error: Param '${paramName}' must be a number`;
            }
            break;
        case 'boolean':
            converted = parseBoolean(value);
            if (converted === null) {
                return `Error: Param '${paramName}' must be a boolean (true/false)`;
            }
            break;
        case 'BlockName':
            if (value.endsWith('plank')) value += 's';
            if (!getBlockId(ctx, value)) {
                return `Invalid block type: ${value}`;
            }
            converted = value;
            break;
        case 'ItemName':
            if (value.endsWith('plank')) value += 's';
            if (!getItemId(ctx, value)) {
                return `Invalid item type: ${value}`;
            }
            converted = value;
            break;
        case 'string':
            converted = value;
            break;
        default:
            throw new Error(`Unknown parameter type: ${param.type}`);
    }

    if (typeof converted === 'number' && param.domain) {
        const [min, max, intervalType = '[)'] = param.domain;
        if (!checkInInterval(converted, min, max, intervalType)) {
            return `Error: Param '${paramName}' must be in range ${intervalType[0]}${min}, ${max}${intervalType[1]}`;
        }
    }

    return converted;
}
