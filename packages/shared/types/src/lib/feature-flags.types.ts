export const FEATURE_FLAG_KEYS = {
  AI_ENABLED: 'ai_enabled',
  VOICE_NOTES_ENABLED: 'voice_notes_enabled',
  AGENT_HYBRID_RETRIEVAL: 'agent_hybrid_retrieval',
  AGENT_WEB_SEARCH: 'agent_web_search',
  AGENT_BYOK: 'agent_byok',
  AGENT_LONGTERM_MEMORY: 'agent_longterm_memory',
  AI_COST_RESERVE: 'ai_cost_reserve',
  AI_BYOK_COST_GATE: 'ai_byok_cost_gate',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

export interface FeatureFlagDto {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}
