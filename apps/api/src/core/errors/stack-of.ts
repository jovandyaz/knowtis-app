import { isDatabaseError } from './database-diagnostics';
import { reasonOf } from './reason-of';

// Cut at the exact message rather than at the first frame-shaped line: a
// quoted parameter can itself hold a newline followed by "    at ...".
function framesOf(error: Error): string {
  const stack = error.stack ?? '';
  if (error.message === '') {
    const firstLineEnd = stack.indexOf('\n');
    return firstLineEnd === -1 ? '' : stack.slice(firstLineEnd);
  }
  const quoted = stack.indexOf(error.message);
  return quoted === -1 ? '' : stack.slice(quoted + error.message.length);
}

/** The stack of whatever was thrown, for a log line; a database error's stack is headed by its {@link reasonOf} instead of the message it quotes, and anything else that was thrown is described by its reason. Never throws. */
export function stackOf(error: unknown): string {
  try {
    if (!(error instanceof Error)) {
      return reasonOf(error);
    }
    if (!isDatabaseError(error)) {
      return error.stack ?? error.message;
    }
    return `${reasonOf(error)}${framesOf(error)}`;
  } catch {
    return reasonOf(error);
  }
}
