/**
 * @file Agent process management
 * @description Handles spawning and monitoring of agent processes
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { AgentStartOptions, ProcessContext } from '../types/proc';

/**
 * Manages agent processes including spawning, monitoring, and restarting
 */
export class AgentProcess {
    private static runningCount = 0;
    private static readonly MIN_RESTART_INTERVAL = 10000; // 10 seconds in ms
    private static readonly INIT_SCRIPT = join('src', 'process', 'init-agent.js');

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

        // Spawn process with typed options
        const agentProcess = this.spawnProcess(args);
        AgentProcess.runningCount++;

        let lastRestart = Date.now();
        this.setupProcessHandlers(agentProcess, {
            profile,
            lastRestart,
            countId,
        });
    }

    /**
     * Spawns a new Node.js process with the specified arguments
     *
     * @param args - Process arguments
     * @returns Spawned child process
     * @private
     */
    private spawnProcess(args: string[]): ChildProcess {
        return spawn('node', args, {
            stdio: 'inherit',
            //stderr: 'inherit',
        });
    }

    /**
     * Sets up event handlers for the agent process
     *
     * @param process - The spawned child process
     * @param context - Context information for error handling
     * @private
     */
    private setupProcessHandlers(
        process: ChildProcess,
        context: ProcessContext
    ): void {
        process.on('exit', (code: number | null, signal: string | null) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);

            if (code !== 0) {
                this.handleNonZeroExit(context);
            } else {
                this.handleCleanExit();
            }
        });

        process.on('error', (err: Error) => {
            console.error('Failed to start agent process:', err);
            this.handleProcessError(err, context);
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
     * @param error - The error that occurred
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