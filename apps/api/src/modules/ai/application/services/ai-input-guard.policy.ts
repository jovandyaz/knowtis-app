import type { Logger } from '@nestjs/common';

import type {
  AiInputDetection,
  AiInputDisposition,
  AiInputSurface,
} from '@knowtis/ai-gateway';

import type { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';

export interface InputDetectionRow {
  readonly detection: AiInputDetection;
  readonly disposition: AiInputDisposition;
  readonly role?: 'user' | 'assistant' | 'tool';
}

export interface DroppedUserTurn {
  readonly score: number;
  readonly contentLength: number;
}

export async function resolveInputEnforcement(
  flags: Pick<FeatureFlagsService, 'isEnabled'>,
  key: string,
  logger: Pick<Logger, 'warn'>
): Promise<boolean> {
  try {
    return await flags.isEnabled(key);
  } catch {
    logger.warn({ event: 'ai.input_guard.flag_unavailable', key });
    return false;
  }
}

/** Emits at most one event per outcome per turn: history rows are rescanned on every replay, so per-row warnings would never stop. */
export function logInputDetections(
  logger: Pick<Logger, 'warn'>,
  rows: readonly InputDetectionRow[],
  context: {
    surface: AiInputSurface;
    userId: string;
    conversationId?: string;
  },
  droppedUserTurn?: DroppedUserTurn
): void {
  const blocked = rows.filter((row) => row.disposition === 'block').length;
  const metadata = {
    surface: context.surface,
    userId: context.userId,
    ...(context.conversationId
      ? { conversationId: context.conversationId }
      : {}),
  };
  if (rows.length > 0) {
    logger.warn({
      event: 'ai.input_guard.detected',
      ...metadata,
      observed: rows.length - blocked,
      blocked,
      rows: rows.map((row) => ({
        ...(row.role ? { role: row.role } : {}),
        disposition: row.disposition,
        score: row.detection.score,
        contentLength: row.detection.contentLength,
        reasonCode: row.detection.reasonCode,
      })),
    });
  }
  if (blocked > 0) {
    logger.warn({
      event: 'agent.history.message_dropped',
      ...metadata,
      blocked,
    });
  }
  if (droppedUserTurn) {
    logger.warn({
      event: 'agent.history.user_turn_dropped',
      ...metadata,
      ...droppedUserTurn,
    });
  }
}
