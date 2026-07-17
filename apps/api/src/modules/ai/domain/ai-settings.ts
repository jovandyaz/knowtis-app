/** Open-tier code defaults every setting resolves to when no DB override exists. Every id here is guard-tested against CURATED_MODELS. */
export const AI_SETTING_DEFAULTS = {
  ai_default_model: 'openrouter:minimax/minimax-m2.5',
  ai_fast_model: 'openrouter:minimax/minimax-m2.5',
  ai_fallback_chain:
    'openrouter:minimax/minimax-m2.5,openrouter:moonshotai/kimi-k2.5,openrouter:deepseek/deepseek-v3.2',
} as const;

/** Splits a comma-separated model chain into trimmed, non-empty ids. */
export function parseChain(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
