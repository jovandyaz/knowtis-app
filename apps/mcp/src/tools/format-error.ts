import { ApiError } from '../api-client/client.js';

interface ToolErrorResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}

export function formatError(error: unknown): ToolErrorResult {
  if (error instanceof ApiError) {
    const messages: Record<number, string> = {
      401: 'Authentication failed. Your API key may be invalid or expired.',
      403: "You don't have permission to perform this action.",
      404: 'Note not found.',
      422: `Invalid input: ${error.message}`,
      429: 'Rate limit exceeded. Try again later.',
    };
    const text = messages[error.status] ?? `API error: ${error.message}`;
    return { content: [{ type: 'text', text }], isError: true };
  }

  const text =
    error instanceof Error ? error.message : 'An unexpected error occurred.';
  return { content: [{ type: 'text', text }], isError: true };
}
