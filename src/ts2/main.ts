import config from './config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Arguments } from 'yargs';
import {AgentProcess} from "./proc/agentProcess";

interface MainArguments extends Arguments {
    profiles?: string[];
}

/**
 * Parses command line arguments
 * @returns Parsed arguments
 */
function parseArguments(): MainArguments {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            string: true, // Ensure array elements are strings
            describe: 'List of agent profile paths',
        })
        .help()
        .alias('help', 'h')
        .parseSync() as MainArguments;  // Type assertion to match our interface
}

/**
 * Gets profile paths from arguments or config
 * @param args - Parsed command line arguments
 * @returns Array of profile paths
 */
function getProfiles(args: MainArguments): string[] {
    return args.profiles || config.profiles;
}

/**
 * Main application entry point
 */
function main(): void {
    const args = parseArguments();
    const profiles = getProfiles(args);
    console.log(profiles);

    const { load_memory, init_message } = config;

    for (let i = 0; i < profiles.length; i++) {
        const agent = new AgentProcess();
        agent.start({
            profile: profiles[i],
            loadMemory: load_memory,
            initMessage: init_message,
            countId: i
        });
    }
}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}