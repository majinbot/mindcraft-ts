import type { Vec3 } from 'vec3';

export interface Construction {
    blocks: string[][][];
    offset: number;
}

export interface BuildingData {
    name: string;
    position: Vec3;
    orientation: number;
}

export interface Goal {
    name: string;
    quantity: number;
}

export interface BlueprintData {
    goals: Goal[];
    currGoal: Goal | null;
    built: { [key: string]: BuildingData };
    home: string | null;
    doRoutine: boolean;
    doSetGoal: boolean;
}

export interface BuildResult {
    missing: { [key: string]: number };
    acted: boolean;
    position: Vec3;
    orientation: number;
}

export interface ItemResult {
    success: boolean;
    acted: boolean;
}
