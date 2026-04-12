import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry } from 'ai';

interface ProviderRegistryOptions {
  googleApiKey?: string | undefined;
  openaiApiKey?: string | undefined;
}

export function buildProviderRegistry(opts: ProviderRegistryOptions = {}) {
  return createProviderRegistry({
    anthropic,
    ...(opts.googleApiKey
      ? { google: createGoogleGenerativeAI({ apiKey: opts.googleApiKey }) }
      : {}),
    ...(opts.openaiApiKey
      ? { openai: createOpenAI({ apiKey: opts.openaiApiKey }) }
      : {}),
  });
}
