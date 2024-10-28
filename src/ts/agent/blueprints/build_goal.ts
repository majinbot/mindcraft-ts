import { Vec3 } from 'vec3';
import * as skills from '../library/skills';
import * as world from '../library/world';
import * as mc from '../../utils/mcdata';
import { blockSatisfied, getTypeOfGeneric, rotateXZ } from './utils';
import type { Agent } from '../agent';
import type { Construction, BuildResult } from '../../types/blueprints';

export class BuildGoal {
    private agent: Agent;

    constructor(agent: Agent) {
        this.agent = agent;
    }

    private async wrapSkill(func: () => Promise<void>): Promise<boolean> {
        if (!this.agent.isIdle()) return false;
        const res = await this.agent.coder.execute(func);
        return !res.interrupted;
    }

    async executeNext(
        goal: Construction, 
        position: Vec3 | null = null, 
        orientation: number | null = null
    ): Promise<BuildResult> {
        const sizex = goal.blocks[0][0].length;
        const sizez = goal.blocks[0].length;
        const sizey = goal.blocks.length;

        if (!position) {
            for (let x = 0; x < sizex - 1; x++) {
                position = world.getNearestFreeSpace(this.agent.bot, sizex - x, 16);
                if (position) break;
            }
        }

        if (orientation === null) {
            orientation = Math.floor(Math.random() * 4);
        }

        const inventory = world.getInventoryCounts(this.agent.bot);
        const missing: { [key: string]: number } = {};
        let acted = false;

        for (let y = goal.offset; y < sizey + goal.offset; y++) {
            for (let z = 0; z < sizez; z++) {
                for (let x = 0; x < sizex; x++) {
                    const [rx, rz] = rotateXZ(x, z, orientation, sizex, sizez);
                    const ry = y - goal.offset;
                    const blockName = goal.blocks[ry][rz][rx];

                    if (blockName === null || blockName === '') continue;

                    const worldPos = new Vec3(
                        position.x + x,
                        position.y + y,
                        position.z + z
                    );
                    const currentBlock = this.agent.bot.blockAt(worldPos);

                    if (currentBlock !== null && !blockSatisfied(blockName, currentBlock)) {
                        acted = true;

                        if (currentBlock.name !== 'air') {
                            const res = await this.wrapSkill(async () => {
                                await skills.breakBlockAt(
                                    this.agent.bot,
                                    worldPos.x,
                                    worldPos.y,
                                    worldPos.z
                                );
                            });
                            if (!res) return { missing, acted, position, orientation };
                        }

                        if (blockName !== 'air') {
                            const blockTyped = getTypeOfGeneric(this.agent.bot, blockName);
                            if (inventory[blockTyped] > 0) {
                                const res = await this.wrapSkill(async () => {
                                    await skills.placeBlock(
                                        this.agent.bot,
                                        blockTyped,
                                        worldPos.x,
                                        worldPos.y,
                                        worldPos.z
                                    );
                                });
                                if (!res) return { missing, acted, position, orientation };
                            } else {
                                missing[blockTyped] = (missing[blockTyped] || 0) + 1;
                            }
                        }
                    }
                }
            }
        }

        return { missing, acted, position, orientation };
    }
}
