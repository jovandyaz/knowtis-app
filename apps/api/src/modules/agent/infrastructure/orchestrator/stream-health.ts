import { Logger } from '@nestjs/common';

export interface StreamHealth {
  ttfpMs: number | null;
  maxGapMs: number;
  parts: number;
  textDeltas: number;
  finishReason: string | null;
  upstream: string | null;
}

export function createHealth(): StreamHealth {
  return {
    ttfpMs: null,
    maxGapMs: 0,
    parts: 0,
    textDeltas: 0,
    finishReason: null,
    upstream: null,
  };
}

export const STREAM_MARKER_PART_TYPES = new Set<string>(['start', 'abort']);

export const AGENT_TURN_OUTCOME = {
  DONE: 'done',
  PROPOSAL: 'proposal',
  ERROR: 'error',
  STALL: 'stall',
  TIMEOUT: 'timeout',
  ABORTED: 'aborted',
  EMPTY: 'empty',
  CONTINUED: 'continued',
} as const;
export type AgentTurnOutcome =
  (typeof AGENT_TURN_OUTCOME)[keyof typeof AGENT_TURN_OUTCOME];

export function openrouterUpstreamOf(part: unknown): string | null {
  if (
    typeof part !== 'object' ||
    part === null ||
    !('providerMetadata' in part)
  ) {
    return null;
  }
  const metadata = part.providerMetadata;
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('openrouter' in metadata)
  ) {
    return null;
  }
  const openrouter = metadata.openrouter;
  if (
    typeof openrouter !== 'object' ||
    openrouter === null ||
    !('provider' in openrouter)
  ) {
    return null;
  }
  const provider = openrouter.provider;
  return typeof provider === 'string' ? provider : null;
}

export function emitTurnHealth(
  logger: Logger,
  userId: string,
  model: string,
  health: StreamHealth,
  outcome: AgentTurnOutcome,
  startedAt: number,
  modelsUsed: readonly string[]
): void {
  logger.log({
    event: 'agent.turn.health',
    userId,
    model,
    outcome,
    ttfpMs: health.ttfpMs,
    maxGapMs: health.maxGapMs,
    parts: health.parts,
    textDeltas: health.textDeltas,
    finishReason: health.finishReason,
    upstream: health.upstream,
    modelsUsed: [...modelsUsed],
    elapsedMs: Date.now() - startedAt,
  });
}
