import type { Logger } from '@nestjs/common';

import type {
  AiInputDetection,
  AiInputDisposition,
  AiInputSurface,
} from '@knowtis/ai-gateway';

type InputRole = 'user' | 'assistant' | 'tool';

export interface InputDetectionRow {
  readonly detection: AiInputDetection;
  readonly disposition: AiInputDisposition;
  readonly role: InputRole;
  readonly redactedSpans: number;
}

export interface DroppedUserTurn {
  readonly score: number;
  readonly contentLength: number;
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
  const count = (disposition: AiInputDisposition) =>
    rows.filter((row) => row.disposition === disposition).length;
  const blocked = count('block');
  const withheld = count('withhold');
  const redacted = count('redact');
  const droppedRoles: Partial<Record<InputRole, number>> = {};
  for (const row of rows) {
    if (row.disposition === 'block') {
      droppedRoles[row.role] = (droppedRoles[row.role] ?? 0) + 1;
    }
  }
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
      blocked,
      rows: rows.map((row) => ({
        role: row.role,
        disposition: row.disposition,
        score: row.detection.score,
        contentLength: row.detection.contentLength,
        reasonCode: row.detection.reasonCode,
        redactedSpans: row.redactedSpans,
      })),
    });
  }
  if (blocked > 0) {
    logger.warn({
      event: 'agent.history.message_dropped',
      ...metadata,
      blocked,
      roles: droppedRoles,
    });
  }
  if (withheld + redacted > 0) {
    logger.warn({
      event: 'agent.history.content_neutralized',
      ...metadata,
      withheld,
      redacted,
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
