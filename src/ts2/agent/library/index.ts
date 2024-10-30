import * as skills from './skills';
import * as world from './world';

interface DocFunction extends Function {
    name: string;
}

function docHelper(functions: DocFunction[], moduleName: string): string {
    return functions
        .map(fn => {
            const str = fn.toString();
            if (!str.includes('/**')) return '';

            const docStart = str.indexOf('/**') + 3;
            const docEnd = str.indexOf('**/');

            return `${moduleName}.${fn.name}${str.substring(docStart, docEnd)}\n`;
        })
        .filter(Boolean)
        .join('');
}

export function getSkillDocs(): string {
    return [
        '\n*SKILL DOCS',
        'These skills are javascript functions that can be called when writing actions and skills.',
        docHelper(Object.values(skills) as DocFunction[], 'skills'),
        docHelper(Object.values(world) as DocFunction[], 'world'),
        '*\n'
    ].join('\n');
}
