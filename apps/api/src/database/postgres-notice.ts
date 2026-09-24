import type { Logger } from '@nestjs/common';
import type { Notice } from 'postgres';

const WARNING_SEVERITY = 'WARNING';
const DEFAULT_SEVERITY = 'NOTICE';
const LINE_BREAKS = /\s*[\r\n]+\s*/g;

/**
 * `onnotice` handler that writes each server notice as one structured log
 * entry, instead of postgres.js's default multi-line `console.log`.
 */
export function logPostgresNotice(logger: Logger): (notice: Notice) => void {
  return ({ severity, code, message, detail, hint }) => {
    const entry = {
      event: 'database.notice',
      noticeSeverity: severity,
      code,
      message,
      ...(detail ? { detail } : {}),
      ...(hint ? { hint } : {}),
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
  hint,
}: Notice): string {
  const label = [severity ?? DEFAULT_SEVERITY, code].filter(Boolean).join(' ');
  return [`${label}: ${message ?? ''}`, hint && `(hint: ${hint})`]
    .filter(Boolean)
    .join(' ')
    .replace(LINE_BREAKS, ' ');
}
