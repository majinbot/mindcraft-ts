import { Agent } from '../../agent';
import settings from '../../settings';
import type { Command } from '../../types/mc/commands';
import type { SkillFunction, WrapExecutionOptions } from '../../types/skills';
import * as skills from '../../mc/player/skills';

function wrapExecution(
    func: SkillFunction,
    options: WrapExecutionOptions = {}
): (agent: Agent, ...args: any[]) => Promise<string | void> {
    const { resume = false, timeout = -1 } = options;
    
    return async function(agent: Agent, ...args: any[]) {
        const wrappedFunction = async () => {
            await func(agent, ...args);
        };

        const codeReturn = resume 
            ? await agent.coder.executeResume(wrappedFunction, timeout)
            : await agent.coder.execute(wrappedFunction, timeout);

        if (codeReturn.interrupted && !codeReturn.timedout) return;
        return codeReturn.message;
    };
}

export const actionsList: Command[] = [
    // Basic control commands
    {
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors that are not available as a command.',
        params: {
            'prompt': { 
                type: 'string', 
                description: 'A natural language prompt to guide code generation. Make a detailed step-by-step plan.' 
            }
        },
        perform: async function(agent: Agent, prompt: string) {
            if (!settings.allow_insecure_coding) {
                return 'newAction not allowed! Code writing is disabled in settings. Notify the user.';
            }
            return await agent.coder.generateCode(agent.history);
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function(agent: Agent) {
            await agent.coder.stop();
            agent.coder.clear();
            agent.coder.cancelResume();
            agent.bot.emit('idle');
            let msg = 'Agent stopped.';
            if (agent.self_prompter.on) {
                msg += ' Self-prompting still active.';
            }
            return msg;
        }
    },
    {
        name: '!stfu',
        description: 'Stop all chatting and self prompting, but continue current action.',
        perform: async function(agent: Agent) {
            agent.bot.chat('Shutting up.');
            agent.shutUp();
        }
    },

    // Reference to original actions.js for remaining action commands
    // startLine: 49
    // endLine: 330
];
