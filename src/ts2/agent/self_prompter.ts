import { Agent } from './index';

export class SelfPrompter {
    private readonly agent: Agent;
    public on = false;
    private loopActive = false;
    private interrupt = false;
    public prompt = '';
    private idleTime = 0;
    private readonly cooldown = 2000;
    private static readonly MAX_NO_COMMAND = 3;

    constructor(agent: Agent) {
        this.agent = agent;
    }

    start(prompt: string): string | void {
        if (!prompt) {
            return 'No prompt specified. Ignoring request.';
        }

        console.log('Self-prompting started.');
        this.on = true;
        this.prompt = prompt;
        this.startLoop().then();
    }

    private async startLoop(): Promise<void> {
        if (this.loopActive) {
            console.warn('Self-prompt loop is already active. Ignoring request.');
            return;
        }

        console.log('Starting self-prompt loop');
        this.loopActive = true;
        let noCommandCount = 0;

        while (!this.interrupt) {
            const msg = `You are self-prompting with the goal: '${this.prompt}'. Your next response MUST contain a command !withThisSyntax. Respond:`;
            const usedCommand = await this.agent.handleMessage('system', msg, -1);

            if (!usedCommand) {
                if (++noCommandCount >= SelfPrompter.MAX_NO_COMMAND) {
                    const out = `Agent did not use command in the last ${SelfPrompter.MAX_NO_COMMAND} auto-prompts. Stopping auto-prompting.`;
                    this.agent.bot.chat(out);
                    console.warn(out);
                    this.on = false;
                    break;
                }
            } else {
                noCommandCount = 0;
                await new Promise(r => setTimeout(r, this.cooldown));
            }
        }

        console.log('Self prompt loop stopped');
        this.loopActive = false;
        this.interrupt = false;
    }

    update(delta: number): void {
        if (!this.on || this.loopActive || this.interrupt) {
            this.idleTime = 0;
            return;
        }

        if (this.agent.isIdle()) {
            this.idleTime += delta;
        } else {
            this.idleTime = 0;
        }

        if (this.idleTime >= this.cooldown) {
            console.log('Restarting self-prompting...');
            this.startLoop().then();
            this.idleTime = 0;
        }
    }

    async stopLoop(): Promise<void> {
        console.log('Stopping self-prompt loop');
        this.interrupt = true;
        while (this.loopActive) {
            await new Promise(r => setTimeout(r, 500));
        }
        this.interrupt = false;
    }

    async stop(stopAction = true): Promise<void> {
        this.interrupt = true;
        if (stopAction) {
            await this.agent.coder.stop();
        }
        await this.stopLoop();
        this.on = false;
    }

    shouldInterrupt(isSelfPrompt: boolean): boolean {
        return isSelfPrompt && this.on && this.interrupt;
    }

    handleUserPromptedCmd(isSelfPrompt: boolean, isAction: boolean): void {
        if (!isSelfPrompt && isAction) {
            this.stopLoop().then();
        }
    }
}