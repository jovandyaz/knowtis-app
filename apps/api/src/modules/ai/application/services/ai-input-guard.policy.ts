import type { Logger } from '@nestjs/common';

import type { AiInputDetection } from '@knowtis/ai-gateway';

import type { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';

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

export function logInputDetection(
  logger: Pick<Logger, 'warn'>,
  detection: AiInputDetection,
  context: {
    surface: 'history';
    disposition: 'allow' | 'observe' | 'block';
    role?: 'user' | 'assistant' | 'tool';
    conversationId?: string;
  }
): void {
  const metadata = {
    surface: context.surface,
    disposition: context.disposition,
    ...(context.role ? { role: context.role } : {}),
    ...(context.conversationId
      ? { conversationId: context.conversationId }
      : {}),
    score: detection.score,
    contentLength: detection.contentLength,
    reasonCode: detection.reasonCode,
  };
  logger.warn({ event: 'ai.input_guard.detected', ...metadata });
  if (context.disposition === 'block') {
    logger.warn({ event: 'agent.history.message_dropped', ...metadata });
  }
}
