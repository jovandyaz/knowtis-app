import type { ZodType } from 'zod';

import type { ChainScope } from '@knowtis/ai-gateway';

import type { AITelemetryContext } from './ai-provider.port';

export interface StructuredOutputOptions {
  readonly model: string;
  readonly system?: string;
  readonly maxRetries?: number;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** 'same-provider' confines fallback to the primary's family; default falls through the whole chain. */
  readonly fallbackScope?: ChainScope;
  readonly timeoutMs?: number;
  readonly telemetry?: AITelemetryContext;
}

export interface StructuredOutputResult<T> {
  readonly object: T;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Model that actually served the request — may differ from the requested one after chain fallback. */
  readonly model: string;
}

export interface AIStructuredOutputProvider {
  generateStructuredOutput<T>(
    prompt: string,
    schema: ZodType<T>,
    options: StructuredOutputOptions
  ): Promise<StructuredOutputResult<T>>;
}

export const AI_STRUCTURED_OUTPUT_PROVIDER = Symbol(
  'AI_STRUCTURED_OUTPUT_PROVIDER'
);
