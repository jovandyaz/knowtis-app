/** Declared OpenRouter routes the LiteLLM price snapshot at afa4aae2 does not price; they stay inert until a catalog refresh prices them. */
const UNPRICED_ROUTES: ReadonlySet<string> = new Set([
  'openrouter:anthropic/claude-sonnet-5',
  'openrouter:openai/gpt-5.6-luna',
  'openrouter:openai/gpt-5.6-terra',
  'openrouter:openai/gpt-5.6-sol',
  'openrouter:google/gemini-3.5-flash-lite',
  'openrouter:google/gemini-3.7-flash',
]);

export function pricedAtSnapshot(modelId: string): boolean {
  return !UNPRICED_ROUTES.has(modelId);
}
