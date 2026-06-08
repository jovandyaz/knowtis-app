export type AgentRole = 'user' | 'assistant';

export interface AgentMessage {
  readonly role: AgentRole;
  readonly content: string;
}
