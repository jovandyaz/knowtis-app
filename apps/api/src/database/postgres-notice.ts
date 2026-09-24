import type { Logger } from '@nestjs/common';
import type { Notice } from 'postgres';

const WARNING_SEVERITY = 'WARNING';

/**
 * `onnotice` handler that writes each server notice as one structured log
 * entry, instead of postgres.js's default multi-line `console.log`.
 */
export function logPostgresNotice(logger: Logger): (notice: Notice) => void {
  return ({ severity, code, message }) => {
    const entry = {
      event: 'database.notice',
      noticeSeverity: severity,
      code,
      message,
    };
    if (severity === WARNING_SEVERITY) {
      logger.warn(entry);
    } else {
      logger.log(entry);
    }
  };
}

/** A server notice on one line, for scripts that run outside Nest. */
export function formatPostgresNotice({
  severity,
  code,
  message,
}: Notice): string {
  return `${severity ?? 'NOTICE'} ${code ?? ''}: ${message ?? ''}`;
}
