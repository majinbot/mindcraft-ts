import type { BlueprintData, Goal } from '../../types/blueprints';

export class BlueprintData {
    public goals: Goal[] = [];
    public currGoal: Goal | null = null;
    public built: { [key: string]: any } = {};
    public home: string | null = null;
    public doRoutine: boolean = false;
    public doSetGoal: boolean = false;

    toObject(): Partial<BlueprintData> {
        const obj: Partial<BlueprintData> = {};
        if (this.goals.length > 0) obj.goals = this.goals;
        if (this.currGoal) obj.currGoal = this.currGoal;
        if (Object.keys(this.built).length > 0) obj.built = this.built;
        if (this.home) obj.home = this.home;
        obj.doRoutine = this.doRoutine;
        obj.doSetGoal = this.doSetGoal;
        return obj;
    }

    static fromObject(obj: Partial<BlueprintData> | null): BlueprintData {
        const data = new BlueprintData();
        if (!obj) return data;

        if (obj.goals) {
            data.goals = obj.goals.map(goal => 
                typeof goal === 'string' 
                    ? { name: goal, quantity: 1 }
                    : { name: goal.name, quantity: goal.quantity }
            );
        }
        if (obj.currGoal) data.currGoal = obj.currGoal;
        if (obj.built) data.built = obj.built;
        if (obj.home) data.home = obj.home;
        if (obj.doRoutine !== undefined) data.doRoutine = obj.doRoutine;
        if (obj.doSetGoal !== undefined) data.doSetGoal = obj.doSetGoal;
        return data;
    }
}
