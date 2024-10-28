import type { ChatMessage } from './mc/chat';

export type LLMProvider = 
  | 'google' 
  | 'openai' 
  | 'anthropic' 
  | 'replicate' 
  | 'ollama' 
  | 'groq' 
  | 'huggingface';

export interface ModelConfig {
  model: string;
  api: LLMProvider;
  url?: string;
  maxTokens?: number;
}

export interface LLMInterface {
  sendRequest(messages: ChatMessage[], systemPrompt: string): Promise<string>;
  getEmbedding?(text: string): Promise<number[]>;
}
