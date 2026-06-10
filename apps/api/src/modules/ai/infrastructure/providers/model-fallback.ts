import type { Logger } from '@nestjs/common';

import { ProviderNotConfiguredError } from './provider-registry.factory';

export interface ModelFallbackContext {
  readonly primaryModel: string;
  readonly fallbackModel: string | undefined;
  readonly logger: Logger;
}

export interface StreamFallbackContext<
  THandle,
  TChunk,
> extends ModelFallbackContext {
  readonly primary: THandle;
  readonly open: (model: string) => THandle;
  readonly chunks: (handle: THandle) => AsyncIterable<TChunk>;
  readonly isAborted?: () => boolean;
  readonly onSettle?: (active: THandle) => void;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function hasModelFallback(
  primaryModel: string,
  fallbackModel: string | undefined
): fallbackModel is string {
  return Boolean(fallbackModel) && fallbackModel !== primaryModel;
}

/**
 * Runs `attempt` with the primary model; on a non-abort failure retries once
 * with the configured fallback model. Rethrows when no distinct fallback is
 * configured or the failure was an AbortError.
 */
export async function withModelFallback<T>(
  attempt: (model: string) => Promise<T>,
  context: ModelFallbackContext
): Promise<T> {
  try {
    return await attempt(context.primaryModel);
  } catch (error) {
    if (
      !hasModelFallback(context.primaryModel, context.fallbackModel) ||
      isAbortError(error)
    ) {
      throw error;
    }
    logFallback('ai.provider.fallback', context, error);
    return attempt(context.fallbackModel);
  }
}

/**
 * Streams chunks from the primary handle; if it fails before emitting
 * anything (and was not aborted), opens a fallback-model handle and streams
 * from it instead. `onSettle` always runs on the last active handle.
 */
export async function* streamWithModelFallback<THandle, TChunk>(
  context: StreamFallbackContext<THandle, TChunk>
): AsyncGenerator<TChunk> {
  let active = context.primary;
  let emitted = false;
  try {
    try {
      for await (const chunk of context.chunks(active)) {
        emitted = true;
        yield chunk;
      }
    } catch (error) {
      if (
        emitted ||
        !hasModelFallback(context.primaryModel, context.fallbackModel) ||
        context.isAborted?.() ||
        isAbortError(error)
      ) {
        throw error;
      }
      logFallback('ai.provider.stream_fallback', context, error);
      active = context.open(context.fallbackModel);
      for await (const chunk of context.chunks(active)) {
        yield chunk;
      }
    }
  } finally {
    context.onSettle?.(active);
  }
}

function isConfigClassError(error: unknown): boolean {
  return (
    error instanceof ProviderNotConfiguredError ||
    (error instanceof Error && error.name === 'AI_NoSuchProviderError')
  );
}

function logFallback(
  event: string,
  context: ModelFallbackContext,
  error: unknown
): void {
  const payload = {
    event,
    primaryModel: context.primaryModel,
    fallbackModel: context.fallbackModel,
    provider: context.primaryModel.split(':')[0],
    reason: error instanceof Error ? error.message : 'unknown error',
  };
  if (isConfigClassError(error)) {
    context.logger.error(payload);
    return;
  }
  context.logger.warn(payload);
}
