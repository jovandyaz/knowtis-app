export const FEATURE_FLAG_KEYS = {
  AI_ENABLED: 'ai_enabled',
  VOICE_NOTES_ENABLED: 'voice_notes_enabled',
  AGENT_HYBRID_RETRIEVAL: 'agent_hybrid_retrieval',
  AGENT_WEB_SEARCH: 'agent_web_search',
  AGENT_BYOK: 'agent_byok',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

export interface FeatureFlagDto {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}
