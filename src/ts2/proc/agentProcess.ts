/**
 * @file Agent process management
 * @description Handles spawning and monitoring of agent processes
 */

import {join} from 'path';
import {AgentStartOptions, ProcessContext} from '../types/proc';

/**
 * Manages agent processes including spawning, monitoring, and restarting
 */
export class AgentProcess {
    private static runningCount = 0;
    private static readonly MIN_RESTART_INTERVAL = 10_000; // 10 seconds in ms
    private static readonly INIT_SCRIPT = join('src', 'ts2', 'proc', 'initAgent.ts');

    /** Name of the agent process */
    public name: string;

    /**
     * Creates a new AgentProcess instance
     * @param name - Optional name for the agent process
     */
    constructor(name: string = 'default') {
        this.name = name;
    }

    /**
     * Starts a new agent process
     *
     * @param options - Configuration options for the agent
     * @throws Error if profile is not provided
     */
    public start(options: AgentStartOptions): void {
        const { profile, loadMemory = false, initMessage = null, countId = 0 } = options;

        if (!profile) {
            throw new Error('Profile must be provided to start agent process');
        }

        // Build process arguments
        const args: string[] = [
            'run',
            AgentProcess.INIT_SCRIPT,
            this.name,
            '-p', profile,
            '-c', countId.toString()
        ];

        if (loadMemory) {
            args.push('-l', String(loadMemory));
        }

        if (initMessage) {
            args.push('-m', initMessage);
        }

        const proc = this.spawnProcess(args, profile, countId);
        AgentProcess.runningCount++;
    }

    /**
     * Spawns a new Bun process with the specified arguments
     *
     * @param args - Process arguments
     * @param profile - Profile path for context
     * @param countId - Process count identifier for context
     * @private
     */
    private spawnProcess(args: string[], profile: string, countId: number) {
        const lastRestart = Date.now();

        return Bun.spawn(['bun', ...args], {
            stdio: ['inherit', 'inherit', 'inherit'],
            env: process.env,
            onExit: (proc, exitCode, signalCode, error) => {
                if (error) {
                    console.error('Process error:', error);
                    this.handleProcessError(error, {
                        profile,
                        lastRestart,
                        countId
                    });
                    return;
                }

                console.log(`Agent process exited with code ${exitCode} and signal ${signalCode}`);

                if (exitCode !== 0) {
                    this.handleNonZeroExit({
                        profile,
                        lastRestart,
                        countId
                    });
                } else {
                    this.handleCleanExit();
                }
            },
        });
    }

    /**
     * Handles non-zero process exits
     *
     * @param context - Process context
     * @private
     */
    private handleNonZeroExit(context: ProcessContext): void {
        const timeSinceRestart = Date.now() - context.lastRestart;

        if (timeSinceRestart < AgentProcess.MIN_RESTART_INTERVAL) {
            console.error(
                `Agent process ${context.profile} exited too quickly and will not be restarted.`
            );
            this.decrementRunningCount();
            return;
        }

        console.log('Restarting agent...');
        this.start({
            profile: context.profile,
            loadMemory: true,
            initMessage: 'Agent process restarted.',
            countId: context.countId,
        });
    }

    /**
     * Handles clean process exits
     * @private
     */
    private handleCleanExit(): void {
        this.decrementRunningCount();
    }

    /**
     * Handles process spawn errors
     *
     * @param error - Error
     * @param context - Process context
     * @private
     */
    private handleProcessError(
        error: Error,
        context: ProcessContext
    ): void {
        console.error(`Process error for profile ${context.profile}:`, error);
        this.decrementRunningCount();
    }

    /**
     * Decrements running process count and exits if no processes remain
     * @private
     */
    private decrementRunningCount(): void {
        AgentProcess.runningCount--;
        if (AgentProcess.runningCount <= 0) {
            console.error('All agent processes have ended. Exiting.');
            process.exit(0);
        }
    }
}