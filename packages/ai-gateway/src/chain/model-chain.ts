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
  /**
   * Marks a yielded chunk as a terminal failure. When any chunk matches, a
   * normally-completed stream records a cooldown failure instead of success —
   * for consumers that surface provider errors as events rather than throws.
   */
  readonly isFailureChunk?: ((chunk: TChunk) => boolean) | undefined;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const TRANSIENT_STATUS_CODES: ReadonlySet<number> = new Set([429, 503]);

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}

export function isOverloadedError(error: unknown): boolean {
  const direct = statusCodeOf(error);
  if (direct !== undefined && TRANSIENT_STATUS_CODES.has(direct)) {
    return true;
  }
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { lastError, errors } = error as {
    lastError?: unknown;
    errors?: unknown;
  };
  if (lastError !== undefined && isOverloadedError(lastError)) {
    return true;
  }
  if (Array.isArray(errors)) {
    return errors.some((inner) => isOverloadedError(inner));
  }
  return false;
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
      try {
        active = context.open(model, { isLast });
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        context.cooldown?.recordFailure(providerOf(model));
        logChainStep(context.logger, model, candidates[i + 1], error);
        if (isLast) {
          throw error;
        }
        continue;
      }
      let emitted = false;
      let sawFailure = false;
      try {
        for await (const chunk of context.chunks(active)) {
          emitted = true;
          if (context.isFailureChunk?.(chunk)) {
            sawFailure = true;
          }
          yield chunk;
        }
        if (sawFailure) {
          context.cooldown?.recordFailure(providerOf(model));
        } else {
          context.cooldown?.recordSuccess(providerOf(model));
        }
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
