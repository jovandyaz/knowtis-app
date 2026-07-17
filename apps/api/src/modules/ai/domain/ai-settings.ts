/** Open-tier code defaults every setting resolves to when no DB override exists. Every id here is guard-tested against CURATED_MODELS. */
export const AI_SETTING_DEFAULTS = {
  ai_default_model: 'openrouter:deepseek/deepseek-v3.2',
  ai_fast_model: 'openrouter:deepseek/deepseek-v3.2',
  ai_fallback_chain:
    'openrouter:deepseek/deepseek-v3.2,openrouter:qwen/qwen3-235b-a22b-2507,openrouter:minimax/minimax-m2.5',
} as const;

/** Splits a comma-separated model chain into trimmed, non-empty ids. */
export function parseChain(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
