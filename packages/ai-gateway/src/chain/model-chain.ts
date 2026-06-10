import type { GatewayLogger } from '../logger';
import type { ProviderCooldown } from './provider-cooldown.tracker';

export interface ChainResolutionInput {
  readonly primaryModel: string;
  readonly chain: readonly string[];
  readonly isModelAvailable?: ((modelId: string) => boolean) | undefined;
  readonly cooldown?: ProviderCooldown | undefined;
}

export interface ChainContext {
  readonly candidates: readonly string[];
  readonly logger: GatewayLogger;
  readonly cooldown?: ProviderCooldown | undefined;
}

export interface ChainAttemptInfo {
  readonly isLast: boolean;
}

export interface StreamChainContext<THandle, TChunk> extends ChainContext {
  readonly open: (model: string, info: ChainAttemptInfo) => THandle;
  readonly chunks: (handle: THandle) => AsyncIterable<TChunk>;
  readonly isAborted?: (() => boolean) | undefined;
  readonly onSettle?: ((active: THandle) => void) | undefined;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function providerOf(modelId: string): string {
  return modelId.split(':')[0] ?? modelId;
}

/**
 * Returns the ordered models to attempt: primary first, then the chain,
 * deduped. Models whose provider lacks credentials or is cooling down are
 * skipped — unless that would leave nothing, in which case the unfiltered
 * list is returned (a request is never failed without at least one attempt).
 */
export function resolveChainCandidates(input: ChainResolutionInput): string[] {
  const ordered = [
    input.primaryModel,
    ...input.chain.filter((m) => m !== input.primaryModel),
  ].filter((model, index, all) => all.indexOf(model) === index);

  const available = input.isModelAvailable
    ? ordered.filter((m) => input.isModelAvailable?.(m))
    : ordered;
  const usable = available.length > 0 ? available : ordered;

  const warm = input.cooldown
    ? usable.filter((m) => !input.cooldown?.isCooling(providerOf(m)))
    : usable;
  return warm.length > 0 ? warm : usable;
}

export async function executeWithChain<T>(
  attempt: (model: string, info: ChainAttemptInfo) => Promise<T>,
  context: ChainContext
): Promise<T> {
  const { candidates } = context;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const isLast = i === candidates.length - 1;
    try {
      const result = await attempt(model, { isLast });
      context.cooldown?.recordSuccess(providerOf(model));
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      context.cooldown?.recordFailure(providerOf(model));
      logChainStep(context.logger, model, candidates[i + 1], error);
      if (isLast) {
        throw error;
      }
    }
  }
  throw new Error('Model chain resolved to zero candidates');
}

/**
 * Streams from each candidate in order. Once a chunk has been emitted the
 * active model is final — a mid-stream failure propagates instead of
 * switching (the consumer already received partial output). `onSettle`
 * always runs on the last handle that was opened.
 */
export async function* streamWithChain<THandle, TChunk>(
  context: StreamChainContext<THandle, TChunk>
): AsyncGenerator<TChunk> {
  const { candidates } = context;
  let active: THandle | undefined;
  try {
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      const isLast = i === candidates.length - 1;
      active = context.open(model, { isLast });
      let emitted = false;
      try {
        for await (const chunk of context.chunks(active)) {
          emitted = true;
          yield chunk;
        }
        context.cooldown?.recordSuccess(providerOf(model));
        return;
      } catch (error) {
        if (emitted || context.isAborted?.() || isAbortError(error)) {
          throw error;
        }
        context.cooldown?.recordFailure(providerOf(model));
        logChainStep(context.logger, model, candidates[i + 1], error);
        if (isLast) {
          throw error;
        }
      }
    }
    throw new Error('Model chain resolved to zero candidates');
  } finally {
    if (active !== undefined) {
      context.onSettle?.(active);
    }
  }
}

function isConfigClassError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'ProviderNotConfiguredError') ||
    (error instanceof Error && error.name === 'AI_NoSuchProviderError')
  );
}

function logChainStep(
  logger: GatewayLogger,
  failedModel: string,
  nextModel: string | undefined,
  error: unknown
): void {
  const payload = {
    event: 'ai.chain.step_failed',
    model: failedModel,
    provider: providerOf(failedModel),
    nextModel: nextModel ?? null,
    reason: error instanceof Error ? error.message : 'unknown error',
  };
  if (isConfigClassError(error)) {
    logger.error(payload);
    return;
  }
  logger.warn(payload);
}
