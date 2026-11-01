import type { AgentMeta, ToolCategory } from './artifacts';

export type AgentAssistStep =
  'responsibility' | 'scope' | 'procedure' | 'delivery' | 'content' | 'model' | 'tools' | 'skills' | 'mcp' | 'review';
export interface AgentAssistInput {
  step: AgentAssistStep;
  name: string;
  body: string;
  sections: Record<string, string>;
  agent: AgentMeta;
  language: 'pt-BR' | 'en';
}
export interface AgentRecommendation {
  name: string;
  reason: string;
}
export interface AgentAssistResult {
  explanation: string;
  suggestions: string[];
  content: string;
  skills: AgentRecommendation[];
  mcpServers: AgentRecommendation[];
  categories: ToolCategory[];
  model: string;
}
