/** Open-tier code defaults every AI setting resolves to when no DB override exists: the floor a fresh install lands on, so each one stays cheap enough for the platform to absorb. Guard-tested against CURATED_MODELS and the free-tier ceiling. */
export const AI_SETTING_DEFAULTS = {
  ai_default_model: 'openrouter:deepseek/deepseek-v3.2',
  ai_fast_model: 'openrouter:minimax/minimax-m2.5',
  ai_deep_model: 'openrouter:moonshotai/kimi-k2.5',
  ai_fallback_chain:
    'openrouter:deepseek/deepseek-v3.2,openrouter:minimax/minimax-m2.5,openrouter:moonshotai/kimi-k2.5',
  ai_free_tier_ceiling: '4.00',
  ai_reasoning_effort: 'medium',
  ai_openrouter_providers: 'fireworks,baseten',
} as const;
