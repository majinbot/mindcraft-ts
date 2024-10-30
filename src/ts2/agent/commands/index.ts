import {Command} from './types';
import {actionsList} from './actions';
import {queryList} from './queries';
import {getBlockId, getItemId} from "../../utils/mcdata";
import {Agent} from "../index";

const commandList = [...queryList, ...actionsList];
const commandMap = Object.fromEntries(commandList.map(cmd => [cmd.name, cmd]));

type MessageMatch = { commandName: string; args: any[] } | string;

export function getCommand(name: string): Command | undefined {
    return commandMap[name];
}

export function containsCommand(message: string): string | null {
    const match = message.match(/!(\w+)(?:\(((?:[^)(]+|'[^']*'|"[^"]*")*)\))?/);
    return match ? "!" + match[1] : null;
}

export function commandExists(commandName: string): boolean {
    return commandMap[!commandName.startsWith("!") ? "!" + commandName : commandName] !== undefined;
}

function parseBoolean(input: string): boolean | null {
    const lower = input.toLowerCase();
    if (['false', 'f', '0', 'off'].includes(lower)) return false;
    if (['true', 't', '1', 'on'].includes(lower)) return true;
    return null;
}

function checkInInterval(
    value: number,
    [min, max, type = '[)']: [number, number, string?]
): boolean {
    switch (type) {
        case '[)': return min <= value && value < max;
        case '()': return min < value && value < max;
        case '(]': return min < value && value <= max;
        case '[]': return min <= value && value <= max;
        default: throw new Error('Unknown interval type: ' + type);
    }
}

function parseCommandMessage(message: string): MessageMatch {
    const match = message.match(/!(\w+)(?:\(((?:[^)(]+|'[^']*'|"[^"]*")*)\))?/);
    if (!match) return 'Command is incorrectly formatted';

    const commandName = "!" + match[1];
    const command = getCommand(commandName);
    if (!command) return `${commandName} is not a command.`;

    const args = match[2] ? match[2].match(/(?:"[^"]*"|'[^']*'|[^,])+/g) || [] : [];
    const params = command.params ? Object.values(command.params) : [];
    const paramNames = command.params ? Object.keys(command.params) : [];

    if (args.length !== params.length) {
        return `Command ${command.name} requires ${params.length} args, got ${args.length}.`;
    }

    for (let i = 0; i < args.length; i++) {
        let arg = args[i].trim().replace(/^['"]|['"]$/g, '');

        if (arg.includes('=')) {
            arg = arg.split('=')[1];
        }

        switch (params[i].type) {
            case 'int':
                arg = parseInt(arg);
                break;
            case 'float':
                arg = parseFloat(arg);
                break;
            case 'boolean':
                arg = parseBoolean(arg);
                break;
            case 'BlockName':
                if (arg.endsWith('plank')) arg += 's';
                if (!getBlockId(arg)) {
                    return `Invalid block type: ${arg}`;
                }
                break;
            case 'ItemName':
                if (!getItemId(arg)) {
                    return `Invalid item type: ${arg}`;
                }
                break;
        }

        if (arg === null || Number.isNaN(arg)) {
            return `Error: Param '${paramNames[i]}' must be ${params[i].type}`;
        }

        if (typeof arg === 'number' && params[i].domain) {
            if (!checkInInterval(arg, params[i].domain)) {
                const [min, max, type = '[)'] = params[i].domain;
                return `Error: Param '${paramNames[i]}' must be in ${type[0]}${min}, ${max}${type[1]}`;
            }
        }

        args[i] = arg;
    }

    return { commandName, args };
}

export function truncCommandMessage(message: string): string {
    const match = message.match(/!(\w+)(?:\(((?:[^)(]+|'[^']*'|"[^"]*")*)\))?/);
    return match ? message.substring(0, match.index! + match[0].length) : message;
}

export function isAction(name: string): boolean {
    return actionsList.some(action => action.name === name);
}

export async function executeCommand(agent: Agent, message: string): Promise<string | void> {
    const parsed = parseCommandMessage(message);
    if (typeof parsed === 'string') return parsed;

    const command = getCommand(parsed.commandName);
    if (!command) return `Unknown command: ${parsed.commandName}`;

    const isActionCommand = isAction(command.name);
    if (isActionCommand) agent.coder.setCurActionName(command.name);

    try {
        return await command.perform(agent, ...parsed.args);
    } finally {
        if (isActionCommand) agent.coder.setCurActionName('');
    }
}

export function getCommandDocs(): string {
    const typeMap = {
        'float': 'number',
        'int': 'number',
        'BlockName': 'string',
        'ItemName': 'string',
        'boolean': 'bool'
    };

    const docs = ['*COMMAND DOCS',
        'Use commands with syntax: !commandName or !commandName("arg1", 1.2, ...).',
        'Do not use codeblocks. Only one command per response.\n'];

    for (const command of commandList) {
        docs.push(`${command.name}: ${command.description}`);
        if (command.params) {
            docs.push('Params:');
            for (const [name, param] of Object.entries(command.params)) {
                docs.push(`${name}: (${typeMap[param.type] || param.type}) ${param.description}`);
            }
        }
        docs.push('');
    }

    return docs.join('\n') + '*\n';
}