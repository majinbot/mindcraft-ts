import { writeFile, readFile, mkdirSync } from 'fs';
import { checkSafe } from '../utils/safety';
import { Agent } from './index';
import { Bot } from 'mineflayer';
import {History} from './history';

interface CodeExecutionResult {
    success: boolean;
    message: string | null;
    interrupted: boolean;
    timedout: boolean;
}

export class Coder {
    set curActionName(value: string) {
        this._curActionName = value;
    }
    private readonly agent: Agent;
    private fileCounter: number = 0;
    private readonly filePath: string;
    private _executing: boolean = false;
    private _generating: boolean = false;
    private codeTemplate: string = '';
    private timedout: boolean = false;
    private _curActionName: string = '';
    private resumeFunc: (() => Promise<void>) | null = null;
    private resumeName: string | null = null;

    // Public getters for state
    get isExecuting(): boolean {
        return this._executing;
    }

    get isGenerating(): boolean {
        return this._generating;
    }

    get curActionName(): string {
        return this._curActionName;
    }

    setCurActionName(name: string): void {
        this._curActionName = name.replace(/!/g, '');
    }

    constructor(agent: Agent) {
        this.agent = agent;
        this.filePath = `/bots/${agent.name}/action-code/`;

        readFile('./bots/template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.codeTemplate = data;
        });

        mkdirSync('.' + this.filePath, { recursive: true });
    }

    async generateCode(agentHistory: History): Promise<string> {
        await this.stop();
        this._generating = true;
        const res = await this.generateCodeLoop(agentHistory);
        this._generating = false;
        if (!res.interrupted) {
            this.agent.bot.emit('idle');
        }
        return res.message || '';
    }

    async execute(
        func: () => Promise<void>,
        timeout: number = 10
    ): Promise<CodeExecutionResult> {
        if (!this.codeTemplate) {
            return {
                success: false,
                message: "Code template not loaded.",
                interrupted: false,
                timedout: false
            };
        }

        let timeoutHandle: NodeJS.Timeout | undefined;

        try {
            await this.stop();
            this.clear();

            this._executing = true;
            if (timeout > 0) {
                timeoutHandle = this.startTimeout(timeout);
            }

            await func();

            this._executing = false;
            if (timeoutHandle) clearTimeout(timeoutHandle);

            const output = this.formatOutput(this.agent.bot);
            const interrupted = this.agent.bot.interrupt_code;
            const timedout = this.timedout;

            this.clear();
            if (!interrupted && !this._generating) {
                this.agent.bot.emit('idle');
            }

            return {
                success: true,
                message: output,
                interrupted,
                timedout
            };

        } catch (err) {
            this._executing = false;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            this.cancelResume();

            console.error("Code execution error:", err);
            await this.stop();

            const message = `${this.formatOutput(this.agent.bot)}!!Code threw exception!! Error: ${err}`;
            const interrupted = this.agent.bot.interrupt_code;

            this.clear();
            if (!interrupted && !this._generating) {
                this.agent.bot.emit('idle');
            }

            return {
                success: false,
                message,
                interrupted,
                timedout: false
            };
        }
    }

    private sanitizeCode(code: string): string {
        code = code.trim();
        const removeStrs = ['Javascript', 'javascript', 'js'];
        for (const r of removeStrs) {
            if (code.startsWith(r)) {
                return code.slice(r.length);
            }
        }
        return code;
    }

    private writeFilePromise(filename: string, src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            writeFile(filename, src, (err) => {
                err ? reject(err) : resolve();
            });
        });
    }

    private async stageCode(code: string): Promise<any> {
        code = this.sanitizeCode(code)
            .replaceAll('console.log(', 'log(bot,')
            .replaceAll('log("', 'log(bot,"');

        console.log(`Generated code: """${code}"""`);

        code = code.replaceAll(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');

        const src = this.codeTemplate.replace(
            '/* CODE HERE */',
            code.split('\n').map(line => `    ${line}`).join('\n')
        );

        const filename = `${this.fileCounter++}.js`;

        try {
            await this.writeFilePromise('.' + this.filePath + filename, src);
            return await import('../..' + this.filePath + filename);
        } catch (err) {
            console.error('Error staging code:', err);
            return null;
        }
    }

    private async generateCodeLoop(agentHistory: History): Promise<CodeExecutionResult> {
        this.agent.bot.modes.pause('unstuck');

        const messages = [
            ...agentHistory.getHistory(),
            { role: 'system' as const, content: 'Code generation started. Write code in codeblock in your response:' }
        ];

        let failures = 0;
        const interruptReturn: CodeExecutionResult = {
            success: true,
            message: null,
            interrupted: true,
            timedout: false
        };

        for (let i = 0; i < 5; i++) {
            if (this.agent.bot.interrupt_code) return interruptReturn;

            const res = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));
            if (this.agent.bot.interrupt_code) return interruptReturn;

            const containsCode = res.includes('```');
            if (!containsCode) {
                const newActionIndex = res.indexOf('!newAction');
                if (newActionIndex !== -1) {
                    messages.push({
                        role: 'assistant',
                        content: res.substring(0, newActionIndex)
                    });
                    continue;
                }

                if (failures >= 3) {
                    return {
                        success: false,
                        message: 'Action failed, agent would not write code.',
                        interrupted: false,
                        timedout: false
                    };
                }

                messages.push({
                    role: 'system',
                    content: 'Error: no code provided. Write code in codeblock in your response. ``` // example ```'
                });
                failures++;
                continue;
            }

            const code = res.substring(res.indexOf('```') + 3, res.lastIndexOf('```'));

            if (!checkSafe(code)) {
                console.warn(`Detected insecure generated code: \n\`${code}\``);
                messages.push({
                    role: 'system',
                    content: 'Error: Code insecurity detected. Do not import, read/write files, execute dynamic code, or access the internet. Please try again:'
                });
                continue;
            }

            const executionFile = await this.stageCode(code);
            if (!executionFile) {
                await agentHistory.add('system', 'Failed to stage code, something is wrong.');
                return {
                    success: false,
                    message: null,
                    interrupted: false,
                    timedout: false
                };
            }

            const codeReturn = await this.execute(async () => {
                return await executionFile.main(this.agent.bot);
            }, this.agent.settings.code_timeout_mins);

            if (codeReturn.interrupted && !codeReturn.timedout) {
                return {
                    success: false,
                    message: null,
                    interrupted: true,
                    timedout: false
                };
            }

            if (codeReturn.success) {
                return {
                    success: true,
                    message: `Summary of newAction\nAgent wrote this code: \n\`\`\`${this.sanitizeCode(code)}\`\`\`\nCode Output:\n${codeReturn.message}`,
                    interrupted: false,
                    timedout: false
                };
            }

            messages.push(
                { role: 'assistant', content: res },
                { role: 'system', content: `${codeReturn.message}\nCode failed. Please try again:` }
            );
        }

        return {
            success: false,
            message: null,
            interrupted: false,
            timedout: true
        };
    }

    async executeResume(func: (() => Promise<void>) | null = null, timeout = 10): Promise<CodeExecutionResult> {
        const newResume = func !== null;
        if (newResume) {
            this.resumeFunc = func;
            this.resumeName = this.curActionName;
        }

        if (this.resumeFunc && this.agent.isIdle() && (!this.agent.self_prompter.on || newResume)) {
            this.curActionName = this.resumeName || '';
            const res = await this.execute(this.resumeFunc, timeout);
            this.curActionName = '';
            return res;
        }

        return {
            success: false,
            message: null,
            interrupted: false,
            timedout: false
        };
    }

    private formatOutput(bot: Bot): string {
        if (bot.interrupt_code && !this.timedout) return '';

        const MAX_OUT = 500;
        const output = bot.output;

        if (output.length <= MAX_OUT) {
            return 'Code output:\n' + output;
        }

        return [
            `Code output is very long (${output.length} chars) and has been shortened.`,
            'First outputs:',
            output.substring(0, MAX_OUT/2),
            '...skipping many lines.',
            'Final outputs:',
            output.substring(output.length - MAX_OUT/2)
        ].join('\n');
    }

    private startTimeout(timeoutMins: number = 10): NodeJS.Timeout {
        return <NodeJS.Timeout>setTimeout(async () => {
            console.warn(`Code execution timed out after ${timeoutMins} minutes. Attempting force stop.`);
            this.timedout = true;
            await this.agent.history.add(
                'system',
                `Code execution timed out after ${timeoutMins} minutes. Attempting force stop.`
            );
            await this.stop();
        }, timeoutMins * 60 * 1000);
    }



    async stop(): Promise<void> {
        if (!this._executing) return;

        const start = Date.now();
        while (this._executing) {
            this.agent.bot.interrupt_code = true;
            await this.agent.bot.collectBlock.cancelTask();
            this.agent.bot.pathfinder.stop();
            await this.agent.bot.pvp.stop();

            console.log('waiting for code to finish executing...');
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (Date.now() - start > 10000) {
                this.agent.cleanKill('Code execution refused stop after 10 seconds. Killing process.');
            }
        }
    }

    clear(): void {
        this.agent.bot.output = '';
        this.agent.bot.interrupt_code = false;
        this.timedout = false;
    }

    cancelResume(): void {
        this.resumeFunc = null;
        this.resumeName = null;
    }
}