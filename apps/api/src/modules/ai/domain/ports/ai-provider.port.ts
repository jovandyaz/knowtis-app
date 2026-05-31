export interface CompletionOptions {
  readonly model: string;
  readonly system?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly maxRetries?: number;
  readonly timeout?: { totalMs?: number; chunkMs?: number };
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
  readonly usage: PromiseLike<{
    promptTokens: number;
    completionTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
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
