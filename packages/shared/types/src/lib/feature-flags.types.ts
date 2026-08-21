export const FEATURE_FLAG_KEYS = {
  AI_ENABLED: 'ai_enabled',
  VOICE_NOTES_ENABLED: 'voice_notes_enabled',
  AGENT_HYBRID_RETRIEVAL: 'agent_hybrid_retrieval',
  AGENT_WEB_SEARCH: 'agent_web_search',
  AGENT_BYOK: 'agent_byok',
  AGENT_LONGTERM_MEMORY: 'agent_longterm_memory',
  AGENT_INJECTION_CLASSIFIER: 'agent_injection_classifier',
  AGENT_SCAN_RETRIEVED_NOTES: 'agent_scan_retrieved_notes',
  AGENT_PROMPT_CACHING: 'agent_prompt_caching',
  AI_COST_RESERVE: 'ai_cost_reserve',
  AI_BYOK_COST_GATE: 'ai_byok_cost_gate',
  AI_GLOBAL_SPEND_BREAKER: 'ai_global_spend_breaker',
  AI_ANON_IP_BUDGET: 'ai_anon_ip_budget',
  AI_TIER_GATING: 'ai_tier_gating',
  AI_CATALOG_SYNC: 'ai_catalog_sync',
  AI_AUTO_ORGANIZE: 'ai_auto_organize',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

export interface FeatureFlagDto {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

export const FLAG_DOMAIN = {
  AI: 'ai',
  PRODUCT: 'product',
} as const;

export type FlagDomain = (typeof FLAG_DOMAIN)[keyof typeof FLAG_DOMAIN];

export const FLAG_GROUP = {
  MASTER: 'master',
  CAPABILITY: 'capability',
  GUARDRAIL: 'guardrail',
  ACCESS: 'access',
  RELEASE: 'release',
  OPS: 'ops',
  PERMISSION: 'permission',
  OTHER: 'other',
} as const;

export type FlagGroup = (typeof FLAG_GROUP)[keyof typeof FLAG_GROUP];

export const REQUIRED_ENV = {
  VOYAGE: 'VOYAGE_API_KEY',
  TAVILY: 'TAVILY_API_KEY',
} as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV)[keyof typeof REQUIRED_ENV];

export interface FlagMeta {
  readonly domain: FlagDomain;
  readonly group: FlagGroup;
  readonly label: string;
  readonly requiresEnv?: RequiredEnvVar;
}

export const FEATURE_FLAG_CATALOG = {
  ai_enabled: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.MASTER,
    label: 'AI enabled',
  },
  voice_notes_enabled: {
    domain: FLAG_DOMAIN.PRODUCT,
    group: FLAG_GROUP.RELEASE,
    label: 'Voice notes',
  },
  agent_hybrid_retrieval: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.CAPABILITY,
    label: 'Hybrid retrieval',
    requiresEnv: REQUIRED_ENV.VOYAGE,
  },
  agent_web_search: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.CAPABILITY,
    label: 'Web search',
    requiresEnv: REQUIRED_ENV.TAVILY,
  },
  agent_byok: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.ACCESS,
    label: 'Bring your own key',
  },
  agent_longterm_memory: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.CAPABILITY,
    label: 'Long-term memory',
    requiresEnv: REQUIRED_ENV.VOYAGE,
  },
  agent_injection_classifier: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.GUARDRAIL,
    label: 'Injection classifier',
  },
  agent_scan_retrieved_notes: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.GUARDRAIL,
    label: 'Scan retrieved notes',
  },
  agent_prompt_caching: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.CAPABILITY,
    label: 'Prompt caching',
  },
  ai_cost_reserve: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.GUARDRAIL,
    label: 'Cost reserve',
  },
  ai_byok_cost_gate: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.GUARDRAIL,
    label: 'BYOK cost gate',
  },
  ai_global_spend_breaker: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.GUARDRAIL,
    label: 'Global spend breaker',
  },
  ai_anon_ip_budget: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.GUARDRAIL,
    label: 'Anonymous IP budget',
  },
  ai_tier_gating: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.ACCESS,
    label: 'Tier gating',
  },
  ai_catalog_sync: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.CAPABILITY,
    label: 'Catalog sync',
  },
  ai_auto_organize: {
    domain: FLAG_DOMAIN.AI,
    group: FLAG_GROUP.CAPABILITY,
    label: 'Organization suggestions',
  },
} as const satisfies Record<FeatureFlagKey, FlagMeta>;

function isCataloguedKey(key: string): key is FeatureFlagKey {
  return Object.hasOwn(FEATURE_FLAG_CATALOG, key);
}

/** Catalog metadata for a flag key; unknown keys fall back to the product "other" group. */
export function flagMetaFor(key: string): FlagMeta {
  if (isCataloguedKey(key)) {
    return FEATURE_FLAG_CATALOG[key];
  }
  return {
    domain: FLAG_DOMAIN.PRODUCT,
    group: FLAG_GROUP.OTHER,
    label: key,
  };
}
