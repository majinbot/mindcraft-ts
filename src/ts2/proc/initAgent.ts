/**
 * @file Agent initialization
 * @description Initializes agent processes with command line arguments
 */

import {Agent} from '../agent';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {AgentArguments} from '../types/proc';

/**
 * Parses and validates command line arguments
 *
 * @returns Parsed agent arguments
 * @throws Error if required arguments are missing
 */
function parseArguments(): AgentArguments {
    const parsed = yargs(hideBin(process.argv))
        .option('profile', {
            alias: 'p',
            type: 'string',
            description: 'Profile filepath to use for agent',
            demandOption: true
        })
        .option('load-memory', {
            alias: 'l',
            type: 'boolean',
            description: 'Load agent memory from file on startup',
            default: false
        })
        .option('init-message', {
            alias: 'm',
            type: 'string',
            description: 'Automatically prompt the agent on startup'
        })
        .option('count-id', {
            alias: 'c',
            type: 'number',
            description: 'Identifying count for multi-agent scenarios',
            default: 0
        })
        .check((argv) => {
            if (!argv.profile) {
                throw new Error('Profile argument is required');
            }
            return true;
        })
        .parseSync();

    // Convert yargs output to our expected format
    return {
        profile: parsed.profile,
        loadMemory: parsed['load-memory'],
        initMessage: parsed['init-message'],
        countId: parsed['count-id']
    };
}

/**
 * Initializes and starts the agent with provided arguments
 */
function main(): void {
    try {
        const args = parseArguments();
        const agent = new Agent();

        agent.start(
            args.profile,
            args.loadMemory,
            args.initMessage,
            args.countId
        ).then()
    } catch (error) {
        console.error('Error initializing agent:', error);
        process.exit(1);
    }
}

// Start the initialization process
main();