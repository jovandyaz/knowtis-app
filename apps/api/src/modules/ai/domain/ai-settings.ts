import type { AIConfigKey } from '@knowtis/shared-types';

/** Auto: an intent model key holding it serves the intent's active platform resolution, and a fallback chain holding it derives from the served intents. Any other value of those keys is an admin pin. */
export const AUTO_MODEL_SETTING = '';

/** Code defaults every AI setting resolves to when no DB row exists. The three intent model keys and the fallback chain ship empty: auto (`AUTO_MODEL_SETTING`). */
export const AI_SETTING_DEFAULTS = {
  ai_default_model: AUTO_MODEL_SETTING,
  ai_fast_model: AUTO_MODEL_SETTING,
  ai_deep_model: AUTO_MODEL_SETTING,
  ai_fallback_chain: AUTO_MODEL_SETTING,
  ai_reasoning_effort: 'medium',
  ai_openrouter_providers: 'fireworks,baseten',
  ai_openrouter_ignored_providers: '',
  ai_anon_daily_messages: '5',
  ai_free_daily_messages: '30',
} as const satisfies Record<AIConfigKey, string>;
