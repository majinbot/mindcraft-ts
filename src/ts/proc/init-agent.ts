import { Agent } from '../agent';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

/**
 * Initialize and start an agent process
 */
async function initAgent(): Promise<void> {
    const argv = await yargs(hideBin(process.argv))
        .option('profile', {
            alias: 'p',
            type: 'string',
            description: 'profile filepath to use for agent',
            demandOption: true,
        })
        .option('load_memory', {
            alias: 'l',
            type: 'boolean',
            description: 'load agent memory from file on startup',
            default: false,
        })
        .option('init_message', {
            alias: 'm',
            type: 'string',
            description: 'automatically prompt the agent on startup',
        })
        .option('count_id', {
            alias: 'c',
            type: 'number',
            default: 0,
            description: 'identifying count for multi-agent scenarios',
        })
        .strict()
        .parse();

    const agent = new Agent();
    await agent.start(
        argv.profile,
        argv.load_memory,
        argv.init_message ?? null,
        argv.count_id
    );
}

// Run with error handling
try {
    await initAgent();
} catch (error) {
    console.error('Error initializing agent:', error);
    process.exit(1);
}