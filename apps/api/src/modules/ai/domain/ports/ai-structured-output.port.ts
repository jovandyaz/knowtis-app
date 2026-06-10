import type { ZodType } from 'zod';

export interface StructuredOutputOptions {
  readonly model: string;
  readonly system?: string;
  readonly maxRetries?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

export interface StructuredOutputResult<T> {
  readonly object: T;
  readonly inputTokens: number;
  readonly outputTokens: number;
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
