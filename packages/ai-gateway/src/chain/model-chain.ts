import type { GatewayLogger } from '../logger';
import type { ProviderCooldown } from './provider-cooldown.tracker';

/**
 * 'same-family' keeps degradation inside the primary's model family — for
 * output a consumer persists as data, where a silent family switch changes the
 * judgement, not just the wording. 'any-family' is the availability-first
 * default.
 */
export const CHAIN_SCOPES = ['any-family', 'same-family'] as const;
export type ChainScope = (typeof CHAIN_SCOPES)[number];

export interface ChainResolutionInput {
  readonly primaryModel: string;
  readonly chain: readonly string[];
  readonly scope?: ChainScope | undefined;
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
  readonly settledModel?: (() => string | undefined) | undefined;
  /**
   * Marks a yielded chunk as a terminal failure. When any chunk matches, a
   * normally-completed stream records a cooldown failure instead of success —
   * for consumers that surface provider errors as events rather than throws.
   */
  readonly isFailureChunk?: ((chunk: TChunk) => boolean) | undefined;
  /** Marks chunks that must not finalize the active model — a candidate that fails after only ephemeral chunks still falls through to the next. */
  readonly isEphemeralChunk?: ((chunk: TChunk) => boolean) | undefined;
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
 * The identity 'same-family' scoping compares: aggregators embed the upstream
 * vendor in the model id, so the provider alone would call deepseek and
 * minimax one family on an all-OpenRouter chain.
 */
function familyOf(modelId: string): string {
  const provider = providerOf(modelId);
  if (!PER_MODEL_COOLDOWN_PROVIDERS.has(provider)) {
    return provider;
  }
  const vendor = modelId.slice(provider.length + 1).split('/')[0] ?? '';
  return `${provider}/${vendor}`;
}

// OpenRouter multiplexes each model to independent upstreams — failures are per-model.
const PER_MODEL_COOLDOWN_PROVIDERS: ReadonlySet<string> = new Set([
  'openrouter',
]);

/**
 * The circuit-breaker bucket for a model: the full model id for aggregator
 * providers (whose models fail independently), the provider otherwise (models
 * that share one key/quota fail together).
 */
export function cooldownKeyOf(modelId: string): string {
  const provider = providerOf(modelId);
  return PER_MODEL_COOLDOWN_PROVIDERS.has(provider) ? modelId : provider;
}

/**
 * Returns the ordered models to attempt: primary first, then the chain,
 * deduped. Models whose provider lacks credentials or is cooling down are
 * skipped — unless that would leave nothing, in which case the unfiltered
 * list is returned (a request is never failed without at least one attempt).
 */
export function resolveChainCandidates(input: ChainResolutionInput): string[] {
  const chain =
    input.scope === 'same-family'
      ? input.chain.filter((m) => familyOf(m) === familyOf(input.primaryModel))
      : input.chain;
  const ordered = [
    input.primaryModel,
    ...chain.filter((m) => m !== input.primaryModel),
  ].filter((model, index, all) => all.indexOf(model) === index);

  const available = input.isModelAvailable
    ? ordered.filter((m) => input.isModelAvailable?.(m))
    : ordered;
  const usable = available.length > 0 ? available : ordered;

  const warm = input.cooldown
    ? usable.filter((m) => !input.cooldown?.isCooling(cooldownKeyOf(m)))
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
      context.cooldown?.recordSuccess(cooldownKeyOf(model));
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      context.cooldown?.recordFailure(cooldownKeyOf(model));
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
        context.cooldown?.recordFailure(cooldownKeyOf(model));
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
          if (!context.isEphemeralChunk?.(chunk)) {
            emitted = true;
          }
          if (context.isFailureChunk?.(chunk)) {
            sawFailure = true;
          }
          yield chunk;
        }
        const served = cooldownKeyOf(context.settledModel?.() ?? model);
        if (sawFailure) {
          context.cooldown?.recordFailure(served);
        } else {
          context.cooldown?.recordSuccess(served);
        }
        return;
      } catch (error) {
        if (emitted || context.isAborted?.() || isAbortError(error)) {
          throw error;
        }
        context.cooldown?.recordFailure(
          cooldownKeyOf(context.settledModel?.() ?? model)
        );
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
