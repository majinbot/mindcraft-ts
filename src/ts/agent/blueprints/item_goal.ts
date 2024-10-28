import * as skills from '../library/skills';
import * as world from '../library/world';
import * as mc from '../../utils/mcdata';
import { itemSatisfied } from './utils';
import type { Agent } from '../agent';

const blacklist = [
    'coal_block',
    'iron_block',
    'gold_block',
    'diamond_block',
    'deepslate',
    'blackstone',
    'netherite',
    '_wood',
    'stripped_',
    'crimson',
    'warped',
    'dye'
];

interface ItemChild {
    node: ItemNode;
    quantity: number;
}

class ItemNode {
    protected manager: ItemGoal;
    protected name: string;
    protected type: 'block' | 'smelt' | 'hunt' | 'craft';
    protected source: string;
    protected recipe: ItemChild[];
    protected fails: number;

    constructor(manager: ItemGoal, name: string) {
        this.manager = manager;
        this.name = name;
        this.fails = 0;
        this.recipe = [];
        
        if (mc.isBlock(name)) {
            this.type = 'block';
            this.source = name;
        } else if (mc.isSmeltable(name)) {
            this.type = 'smelt';
            this.source = name;
        } else if (mc.isHuntable(name)) {
            this.type = 'hunt';
            this.source = name;
        } else {
            this.type = 'craft';
            this.source = '';
        }
    }

    protected getChildren(): ItemChild[] {
        if (this.recipe.length > 0) return this.recipe;

        if (this.type === 'smelt') {
            const smeltable = mc.getSmeltableFor(this.name);
            if (smeltable) {
                this.recipe = [{
                    node: new ItemNode(this.manager, smeltable),
                    quantity: 1
                }];
            }
        } else if (this.type === 'craft') {
            const recipe = mc.getRecipeFor(this.name);
            if (recipe) {
                this.recipe = Object.entries(recipe).map(([item, count]) => ({
                    node: new ItemNode(this.manager, item),
                    quantity: count
                }));
            }
        }
        return this.recipe;
    }

    protected isReady(): boolean {
        if (this.type === 'block' || this.type === 'hunt') return true;
        return this.getChildren().every(child => 
            itemSatisfied(this.manager.agent.bot, child.node.name, child.quantity)
        );
    }

    isDone(quantity: number = 1): boolean {
        if (this.manager.goal.name === this.name) return false;
        return itemSatisfied(this.manager.agent.bot, this.name, quantity);
    }

    getDepth(quantity: number = 1): number {
        if (this.isDone(quantity)) return 0;
        const depth = Math.max(...this.getChildren().map(child => 
            child.node.getDepth(child.quantity)
        ), 0);
        return depth + 1;
    }

    getFails(quantity: number = 1): number {
        if (this.isDone(quantity)) return 0;
        const childFails = this.getChildren().reduce((sum, child) => 
            sum + child.node.getFails(child.quantity), 0
        );
        return childFails + this.fails;
    }

    getNext(quantity: number = 1): { node: ItemNode; quantity: number } | null {
        if (this.isDone(quantity)) return null;
        if (this.isReady()) return { node: this, quantity };
        
        for (const child of this.getChildren()) {
            const res = child.node.getNext(child.quantity);
            if (res) return res;
        }
        return null;
    }

    async execute(quantity: number = 1): Promise<void> {
        if (!this.isReady()) {
            this.fails++;
            return;
        }

        const inventory = world.getInventoryCounts(this.manager.agent.bot);
        const initQuantity = inventory[this.name] || 0;

        if (this.type === 'block') {
            await skills.collectBlock(
                this.manager.agent.bot,
                this.source,
                quantity,
                this.manager.agent.blueprints.getBuiltPositions()
            );
        } else if (this.type === 'smelt') {
            const toSmeltName = this.recipe[0].node.name;
            const toSmeltQuantity = Math.min(quantity, inventory[toSmeltName] || 1);
            await skills.smeltItem(this.manager.agent.bot, toSmeltName, toSmeltQuantity);
        } else if (this.type === 'hunt') {
            for (let i = 0; i < quantity; i++) {
                const res = await skills.attackNearest(this.manager.agent.bot, this.source);
                if (!res || this.manager.agent.bot.interrupt_code) break;
            }
        } else if (this.type === 'craft') {
            await skills.craftRecipe(this.manager.agent.bot, this.name, quantity);
        }

        const finalQuantity = world.getInventoryCounts(this.manager.agent.bot)[this.name] || 0;
        if (finalQuantity <= initQuantity) {
            this.fails++;
        }
    }
}

export class ItemGoal {
    public agent: Agent;
    public goal: ItemNode | null;
    private nodes: { [key: string]: ItemNode };
    private failed: string[];

    constructor(agent: Agent) {
        this.agent = agent;
        this.goal = null;
        this.nodes = {};
        this.failed = [];
    }

    async executeNext(itemName: string, itemQuantity: number = 1): Promise<boolean> {
        if (!this.nodes[itemName]) {
            this.nodes[itemName] = new ItemNode(this, itemName);
        }
        this.goal = this.nodes[itemName];

        const nextInfo = this.goal.getNext(itemQuantity);
        if (!nextInfo) {
            console.log(`Invalid item goal ${this.goal.name}`);
            return false;
        }

        const next = nextInfo.node;
        const quantity = nextInfo.quantity;

        if ((next.type === 'block' && !world.getNearbyBlockTypes(this.agent.bot).includes(next.source)) ||
            (next.type === 'hunt' && !world.getNearbyEntityTypes(this.agent.bot).includes(next.source))) {
            next.fails++;

            if (this.failed.includes(next.name)) {
                this.failed = this.failed.filter(item => item !== next.name);
                await this.agent.coder.execute(async () => {
                    await skills.moveAway(this.agent.bot, 8);
                });
            } else {
                this.failed.push(next.name);
                await new Promise(resolve => setTimeout(resolve, 500));
                this.agent.bot.emit('idle');
            }
            return false;
        }

        if (!this.agent.isIdle()) return false;

        const initQuantity = world.getInventoryCounts(this.agent.bot)[next.name] || 0;
        await this.agent.coder.execute(async () => {
            await next.execute(quantity);
        });
        const finalQuantity = world.getInventoryCounts(this.agent.bot)[next.name] || 0;

        if (finalQuantity > initQuantity) {
            console.log(`Successfully obtained ${next.name} for goal ${this.goal.name}`);
        } else {
            console.log(`Failed to obtain ${next.name} for goal ${this.goal.name}`);
        }
        return finalQuantity > initQuantity;
    }
}
