import type { Logger } from '@nestjs/common';

function statusCodeOf(error: unknown): { statusCode: number } | object {
  const status =
    typeof error === 'object' && error !== null
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;
  return typeof status === 'number' ? { statusCode: status } : {};
}

/**
 * Replaces the AI SDK's default `onError`, which prints the whole provider
 * error — request and response bodies included — straight to stdout, past the
 * JSON logger's redaction. The same error still reaches the caller as the
 * stream's error part.
 */
export function logStreamErrorRedacted(
  logger: Pick<Logger, 'debug'>,
  context: Readonly<Record<string, string>>
): (event: { error: unknown }) => void {
  return ({ error }) => {
    logger.debug({
      event: 'ai.stream.error_part',
      ...context,
      errorName: error instanceof Error ? error.name : typeof error,
      ...statusCodeOf(error),
    });
  };
}
