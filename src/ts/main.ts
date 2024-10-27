// src/main.ts
import { AgentProcess } from './proc/agent-process';
import settings from './settings';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface Arguments {
    profiles?: string[];
    [key: string]: unknown;
}

function parseArguments(): Arguments {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .help()
        .alias('help', 'h')
        .parse() as Arguments;
}

function getProfiles(args: Arguments): string[] {
    return args.profiles || settings.profiles;
}

async function main(): Promise<void> {
    const args = parseArguments();
    const profiles = getProfiles(args);

    console.log('Loading profiles:', profiles);

    const { load_memory, init_message } = settings;

    const agents: AgentProcess[] = profiles.map(() => new AgentProcess());

    await Promise.all(
        agents.map((agent, index) =>
            agent.start({
                profile: profiles[index],
                loadMemory: load_memory,
                initMessage: init_message,
                countId: index
            })
        )
    );


    // Handle process termination
    process.on('SIGINT', async () => {
        console.log('\nGracefully shutting down agents...');
        await Promise.all(agents.map(agent => agent.cleanup()));
        process.exit(0);
    });
}

// Run main with error handling
try {
    await main();
} catch (error) {
    console.error('Fatal error occurred:', error);
    process.exit(1);
}