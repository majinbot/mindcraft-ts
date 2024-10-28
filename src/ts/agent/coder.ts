import { writeFile, readFile, mkdirSync } from 'fs';
import { Bot } from 'mineflayer';
import { checkSafe } from '../utils/safety';
import settings from '../settings';
import type { Agent } from '../agent';
import type { ChatMessage } from '../types/mc/chat';

interface CodeReturn {
    success: boolean;
    message: string | null;
    interrupted: boolean;
    timedout: boolean;
}

export class Coder {
    private agent: Agent;
    private fileCounter: number;
    private filePath: string;
    private executing: boolean;
    private generating: boolean;
    private codeTemplate: string;
    private timedout: boolean;
    private curActionName: string;
    private resumeFunc: (() => Promise<void>) | null;
    private resumeName: string | null;

    constructor(agent: Agent) {
        this.agent = agent;
        this.fileCounter = 0;
        this.filePath = `/bots/${agent.name}/action-code/`;
        this.executing = false;
        this.generating = false;
        this.codeTemplate = '';
        this.timedout = false;
        this.curActionName = '';
        this.resumeFunc = null;
        this.resumeName = null;

        readFile('./bots/template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.codeTemplate = data;
        });

        mkdirSync('.' + this.filePath, { recursive: true });
    }

    async stageCode(code: string): Promise<any> {
        code = this.sanitizeCode(code);
        let src = '';
        code = code.replaceAll('console.log(', 'log(bot,');
        code = code.replaceAll('log("', 'log(bot,"');

        console.log(`Generated code: """${code}"""`);

        code = code.replaceAll(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');
        for (const line of code.split('\n')) {
            src += `    ${line}\n`;
        }
        src = this.codeTemplate.replace('/* CODE HERE */', src);

        const filename = this.fileCounter + '.js';
        this.fileCounter++;

        const writeResult = await this.writeFilePromise('.' + this.filePath + filename, src);
        
        if (writeResult) {
            console.error('Error writing code execution file: ' + writeResult);
            return null;
        }
        return await import('../..' + this.filePath + filename);
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
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async generateCode(agentHistory: ChatMessage[]): Promise<string | null> {
        await this.stop();
        this.generating = true;
        const res = await this.generateCodeLoop(agentHistory);
        this.generating = false;
        if (!res.interrupted) this.agent.bot.emit('idle');
        return res.message;
    }

    private async generateCodeLoop(agentHistory: ChatMessage[]): Promise<CodeReturn> {
        this.agent.bot.modes.pause('unstuck');

        const messages = agentHistory.getHistory();
        messages.push({role: 'system', content: 'Code generation started. Write code in codeblock in your response:'});

        let code: string | null = null;
        let codeReturn: CodeReturn | null = null;
        let failures = 0;
        const interruptReturn: CodeReturn = {success: true, message: null, interrupted: true, timedout: false};

        for (let i = 0; i < 5; i++) {
            if (this.agent.bot.interrupt_code) {
                return interruptReturn;
            }

            console.log(messages);
            const res = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));
            
            if (this.agent.bot.interrupt_code) {
                return interruptReturn;
            }

            const containsCode = res.indexOf('```') !== -1;
            if (!containsCode) {
                if (res.indexOf('!newAction') !== -1) {
                    messages.push({
                        role: 'assistant',
                        content: res.substring(0, res.indexOf('!newAction'))
                    });
                    continue;
                }

                if (failures >= 3) {
                    return {success: false, message: 'Action failed, agent would not write code.', interrupted: false, timedout: false};
                }

                messages.push({
                    role: 'system',
                    content: 'Error: no code provided. Write code in codeblock in your response. ``` // example ```'
                });
                failures++;
                continue;
            }

            code = res.substring(res.indexOf('```') + 3, res.lastIndexOf('```'));

            if (!checkSafe(code)) {
                console.warn(`Detected insecure generated code, not executing. Insecure code: \n\`${code}\``);
                messages.push({
                    role: 'system',
                    content: 'Error: Code insecurity detected. Do not import, read/write files, execute dynamic code, or access the internet. Please try again:'
                });
                continue;
            }

            const executionFile = await this.stageCode(code);
            if (!executionFile) {
                agentHistory.add('system', 'Failed to stage code, something is wrong.');
                return {success: false, message: null, interrupted: false, timedout: false};
            }

            codeReturn = await this.execute(async () => {
                return await executionFile.main(this.agent.bot);
            }, settings.code_timeout_mins);

            if (codeReturn.interrupted && !codeReturn.timedout) {
                return {success: false, message: null, interrupted: true, timedout: false};
            }

            console.log("Code generation result:", codeReturn.success, codeReturn.message);

            if (codeReturn.success) {
                const summary = `Summary of newAction\nAgent wrote this code: \n\`\`\`${this.sanitizeCode(code)}\`\`\`\nCode Output:\n${codeReturn.message}`;
                return {success: true, message: summary, interrupted: false, timedout: false};
            }

            messages.push({role: 'assistant', content: res});
            messages.push({
                role: 'system',
                content: codeReturn.message + '\nCode failed. Please try again:'
            });
        }

        return {success: false, message: null, interrupted: false, timedout: true};
    }

    async executeResume(func: (() => Promise<void>) | null = null, timeout = 10): Promise<CodeReturn> {
        const newResume = func !== null;
        if (newResume) {
            this.resumeFunc = func;
            this.resumeName = this.curActionName;
        }

        if (this.resumeFunc && this.agent.isIdle() && (!this.agent.self_prompter.on || newResume)) {
            this.curActionName = this.resumeName!;
            const res = await this.execute(this.resumeFunc, timeout);
            this.curActionName = '';
            return res;
        }
        
        return {success: false, message: null, interrupted: false, timedout: false};
    }

    cancelResume(): void {
        this.resumeFunc = null;
        this.resumeName = null;
    }

    setCurActionName(name: string): void {
        this.curActionName = name.replace(/!/g, '');
    }

    async execute(func: () => Promise<void>, timeout = 10): Promise<CodeReturn> {
        if (!this.codeTemplate) {
            return {success: false, message: "Code template not loaded.", interrupted: false, timedout: false};
        }

        let TIMEOUT: NodeJS.Timeout;
        try {
            console.log('executing code...\n');
            await this.stop();
            this.clear();

            this.executing = true;
            if (timeout > 0) {
                TIMEOUT = this._startTimeout(timeout);
            }
            await func();
            this.executing = false;
            clearTimeout(TIMEOUT!);

            const output = this.formatOutput(this.agent.bot);
            const interrupted = this.agent.bot.interrupt_code;
            const timedout = this.timedout;
            this.clear();
            if (!interrupted && !this.generating) this.agent.bot.emit('idle');
            return {success: true, message: output, interrupted, timedout};
        } catch (err) {
            this.executing = false;
            clearTimeout(TIMEOUT!);
            this.cancelResume();
            console.error("Code execution triggered catch: " + err);
            await this.stop();

            const message = this.formatOutput(this.agent.bot) + '!!Code threw exception!!  Error: ' + err;
            const interrupted = this.agent.bot.interrupt_code;
            this.clear();
            if (!interrupted && !this.generating) this.agent.bot.emit('idle');
            return {success: false, message, interrupted, timedout: false};
        }
    }

    private formatOutput(bot: Bot): string {
        if (bot.interrupt_code && !this.timedout) return '';
        let output = bot.output;
        const MAX_OUT = 500;
        if (output.length > MAX_OUT) {
            output = `Code output is very long (${output.length} chars) and has been shortened.\n
                First outputs:\n${output.substring(0, MAX_OUT/2)}\n...skipping many lines.\nFinal outputs:\n ${output.substring(output.length - MAX_OUT/2)}`;
        } else {
            output = 'Code output:\n' + output;
        }
        return output;
    }

    async stop(): Promise<void> {
        if (!this.executing) return;
        const start = Date.now();
        while (this.executing) {
            this.agent.bot.interrupt_code = true;
            this.agent.bot.collectBlock.cancelTask();
            this.agent.bot.pathfinder.stop();
            this.agent.bot.pvp.stop();
            console.log('waiting for code to finish executing...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (Date.now() - start > 10 * 1000) {
                this.agent.cleanKill('Code execution refused stop after 10 seconds. Killing process.');
            }
        }
    }

    clear(): void {
        this.agent.bot.output = '';
        this.agent.bot.interrupt_code = false;
        this.timedout = false;
    }

    private _startTimeout(TIMEOUT_MINS = 10): NodeJS.Timeout {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.history.add('system', `Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            await this.stop();
        }, TIMEOUT_MINS * 60 * 1000);
    }
}
