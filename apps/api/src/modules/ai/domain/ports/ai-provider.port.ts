export interface AITelemetryContext {
  /** Span identifier in tracing backends, e.g. 'completion:summarize'. */
  readonly functionId: string;
  /** Trace-level identity, propagated via @langfuse/tracing propagateAttributes. */
  readonly userId?: string;
  /** Record prompt/response content in traces. Default: redact. */
  readonly recordContent?: boolean;
}

export interface CompletionOptions {
  readonly model: string;
  readonly instructions?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly maxRetries?: number;
  readonly timeout?: { totalMs?: number; chunkMs?: number };
  readonly signal?: AbortSignal;
  readonly telemetry?: AITelemetryContext;
}

export interface CompletionResult {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

export interface StreamCompletionResult {
  readonly textStream: AsyncIterable<string>;
  /** Settles only once textStream consumption starts; do not await without iterating. */
  readonly usage: PromiseLike<{
    promptTokens: number;
    completionTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    /** Model that actually served the stream after chain fallback. */
    model: string;
  }>;
}

export interface AICompletionProvider {
  streamCompletion(
    prompt: string,
    options: CompletionOptions
  ): StreamCompletionResult;
  generateCompletion(
    prompt: string,
    options: CompletionOptions
  ): Promise<CompletionResult>;
}

export const AI_COMPLETION_PROVIDER = Symbol('AI_COMPLETION_PROVIDER');
