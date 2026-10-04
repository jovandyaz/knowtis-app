import type { AIConfigKey } from '@knowtis/shared-types';

/** Open-tier code defaults every AI setting resolves to when no DB override exists: the floor a fresh install lands on, so each one stays cheap enough for the platform to absorb. Guard-tested by snapshot-floor.spec.ts. */
export const AI_SETTING_DEFAULTS = {
  ai_default_model: 'openrouter:deepseek/deepseek-v3.2',
  ai_fast_model: 'openrouter:minimax/minimax-m2.5',
  ai_deep_model: 'openrouter:moonshotai/kimi-k2.5',
  ai_fallback_chain:
    'openrouter:deepseek/deepseek-v3.2,openrouter:minimax/minimax-m2.5,openrouter:moonshotai/kimi-k2.5',
  ai_reasoning_effort: 'medium',
  ai_openrouter_providers: 'fireworks,baseten',
  ai_openrouter_ignored_providers: '',
  ai_anon_daily_messages: '5',
  ai_free_daily_messages: '30',
} as const satisfies Record<AIConfigKey, string>;
