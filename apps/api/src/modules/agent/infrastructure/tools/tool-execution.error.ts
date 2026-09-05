export const TOOL_ERROR_CODES = {
  WEB_TIMEOUT: 'WEB_TIMEOUT',
  WEB_UPSTREAM_FAILED: 'WEB_UPSTREAM_FAILED',
  NOTE_STORE_FAILED: 'NOTE_STORE_FAILED',
} as const;

export type ToolErrorCode =
  (typeof TOOL_ERROR_CODES)[keyof typeof TOOL_ERROR_CODES];

/**
 * A tool failure whose message is authored by us, never copied from the
 * upstream provider, so it is safe to log and surface. The raw upstream
 * error stays on `cause` for debuggers and error trackers only.
 */
export class ToolExecutionError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Runs an upstream call and replaces any rejection with a ToolExecutionError
 * chosen by `classify`, so provider response bodies never leave the boundary.
 */
export async function wrapUpstreamFailure<T>(
  run: () => Promise<T>,
  classify: (error: unknown) => ToolExecutionError
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw classify(error);
  }
}
