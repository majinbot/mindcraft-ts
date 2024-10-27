import { spawn, type ChildProcess } from 'child_process';
import { AgentArgs } from '../types/agent';

export class AgentProcess {
    private static runningCount = 0;
    private static readonly MIN_RESTART_DELAY = 10000; // 10 seconds in ms
    private process: ChildProcess | null = null;
    private lastRestart: number = 0;

    /**
     * Start an agent process with the given configuration
     * @param args - Agent configuration arguments
     */
    async start({
                    profile,
                    loadMemory = false,
                    initMessage = null,
                    countId = 0
                }: Partial<AgentArgs> & Pick<AgentArgs, 'profile'>): Promise<void> {
        const spawnArgs = [
            'src/process/init-agent.js',
            '-p', profile,
            '-c', countId.toString(),
        ];

        if (loadMemory) {
            spawnArgs.push('-l', 'true');
        }

        if (initMessage) {
            spawnArgs.push('-m', initMessage);
        }

        this.process = spawn('bun', spawnArgs, {
            stdio: 'inherit',
            // stderr: 'inherit',
        });

        AgentProcess.runningCount++;
        this.lastRestart = Date.now();

        return new Promise((resolve, reject) => {
            if (!this.process) {
                reject(new Error('Failed to spawn agent process'));
                return;
            }

            resolve();

            this.process.on('exit', (code, signal) => {
                console.log(`Agent process exited with code ${code} and signal ${signal}`);

                if (code !== 0) {
                    this.handleNonZeroExit({ profile, loadMemory, countId, initMessage });
                }
            });

            this.process.on('error', (err) => {
                console.error('Failed to start agent process:', err);
            });
        });
    }

    /**
     * Handle non-zero exit codes from the agent process
     */
    private handleNonZeroExit(args: AgentArgs): void {
        const timeSinceLastRestart = Date.now() - this.lastRestart;

        if (timeSinceLastRestart < AgentProcess.MIN_RESTART_DELAY) {
            console.error(
                `Agent process ${args.profile} exited too quickly and will not be restarted.`
            );
            AgentProcess.runningCount--;

            if (AgentProcess.runningCount <= 0) {
                console.error('All agent processes have ended. Exiting.');
                process.exit(0);
            }
            return;
        }

        console.log('Restarting agent...');
        void this.start({
            ...args,
            loadMemory: true,
            initMessage: 'Agent process restarted.'
        });
        this.lastRestart = Date.now();
    }


    /**
     * Clean up the agent process
     */
    async cleanup(): Promise<void> {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }

    /**
     * Get the number of running agent processes
     */
    static getRunningCount(): number {
        return AgentProcess.runningCount;
    }
}