import { OPENROUTER_PROVIDER, providerOf } from '@knowtis/ai-gateway';
import type { AIProvider } from '@knowtis/shared-types';

// Under a none tool choice, @ai-sdk/anthropic sends no tools yet keeps the
// history's tool_use/tool_result blocks, which the API answers empty or
// rejects; some OpenRouter upstreams keep rendering the tools with their
// tool-call parser off, so raw tool-call markup comes back as the answer.
const TOOL_CHOICE_NONE_UNRELIABLE = new Set<string>([
  'anthropic',
  OPENROUTER_PROVIDER,
] satisfies AIProvider[]);

/**
 * Whether a none tool choice on this model reliably yields a text answer
 * while the history carries tool activity. When false, a call that must not
 * use tools has to go without tools and with a tool-free history instead.
 */
export function honoursToolChoiceNone(model: string): boolean {
  return !TOOL_CHOICE_NONE_UNRELIABLE.has(providerOf(model));
}
