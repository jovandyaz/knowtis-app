import { isDatabaseError } from './database-diagnostics';
import { reasonOf } from './reason-of';

/** The stack of whatever was thrown, for a log line; a database error's stack is headed by its {@link reasonOf} instead of the message it quotes. */
export function stackOf(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  if (!isDatabaseError(error)) {
    return error.stack ?? error.message;
  }
  const stack = error.stack ?? '';
  const quoted = stack.indexOf(error.message);
  const frames =
    quoted === -1 ? '' : stack.slice(quoted + error.message.length);
  return `${reasonOf(error)}${frames}`;
}
