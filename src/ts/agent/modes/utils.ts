import type { Agent } from '../agent';
import type { Mode, ModeExecuteReturn } from '../types/modes';
import { settings } from '../../settings';
import { handleTranslation } from '../../utils/translator';

export async function say(agent: Agent, message: string): Promise<void> {
    agent.bot.modes.behaviorLog += `${message}\n`;
    if (agent.shutUp || !settings.narrateBehavior) return;
    const translation = await handleTranslation(message);
    agent.bot.chat(translation);
}

export async function execute(
    mode: Mode, 
    agent: Agent, 
    func: () => Promise<void>, 
    timeout: number = -1
): Promise<ModeExecuteReturn> {
    if (agent.selfPrompter.on) {
        await agent.selfPrompter.stopLoop();
    }
    
    mode.active = true;
    const codeReturn = await agent.coder.execute(func, timeout);
    mode.active = false;
    
    console.log(`Mode ${mode.name} finished executing, code_return: ${codeReturn.message}`);
    return codeReturn;
}
