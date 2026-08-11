/** Open-tier code defaults every AI setting resolves to when no DB override exists. Model ids are guard-tested against CURATED_MODELS. */
export const AI_SETTING_DEFAULTS = {
  ai_default_model: 'openrouter:z-ai/glm-5.2',
  ai_fast_model: 'openrouter:minimax/minimax-m2.5',
  ai_deep_model: 'openrouter:moonshotai/kimi-k2.5',
  ai_fallback_chain:
    'openrouter:z-ai/glm-5.2,openrouter:minimax/minimax-m2.5,openrouter:deepseek/deepseek-v3.2',
  ai_reasoning_effort: 'medium',
  ai_openrouter_providers: 'fireworks,baseten',
} as const;

export const CHAIN_SEPARATOR = ',';

/** Splits a comma-separated model chain into trimmed, non-empty ids. */
export function parseChain(value: string): string[] {
  return value
    .split(CHAIN_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
