import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry } from 'ai';

export function buildProviderRegistry(openaiApiKey?: string) {
  return createProviderRegistry({
    anthropic,
    ...(openaiApiKey ? { openai: createOpenAI({ apiKey: openaiApiKey }) } : {}),
  });
}
