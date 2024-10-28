import type { Command } from '../../types/mc/commands';
import { actionsList } from './actions';
import { queryList } from './queries';
import { COMMAND_REGEX } from './utils';

const commandList: Command[] = [...queryList, ...actionsList];
const commandMap: Record<string, Command> = Object.fromEntries(
    commandList.map(cmd => [cmd.name, cmd])
);

export function getCommand(name: string): Command | undefined {
    return commandMap[name];
}

export function containsCommand(message: string): string | null {
    const commandMatch = message.match(COMMAND_REGEX);
    return commandMatch ? `!${commandMatch[1]}` : null;
}

export function commandExists(commandName: string): boolean {
    if (!commandName.startsWith('!')) {
        commandName = `!${commandName}`;
    }
    return commandMap[commandName] !== undefined;
}

export { actionsList, queryList };
