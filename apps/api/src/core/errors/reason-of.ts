/** The message of whatever was thrown, for a log line or a report. */
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
