import type { ModelConfig } from './llm';

export interface ProfileConfig {
  name: string;
  model: string | ModelConfig;
  embedding?: string | ModelConfig;
  cooldown?: number;
  maxTokens?: number;
  modes?: string[];
  conversationExamples?: string[];
  codingExamples?: string[];
  conversing: string;
  coding: string;
  savingMemory: string;
  goalSetting: string;
}

export interface Goal {
  name: string;
  quantity: number;
}

export interface LastGoals {
  [goal: string]: boolean;
}
