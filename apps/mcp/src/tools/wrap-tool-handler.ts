import { ApiError } from '../api-client/client.js';
import type { AuthService } from '../auth/auth-service.js';
import { resolveCredentialToken } from '../auth/auth-service.js';
import type { McpCredential } from '../auth/credentials.js';
import { logToolCall } from '../middleware/logger.js';
import { formatError } from './format-error.js';

interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function wrapToolHandler<TArgs, TResult extends Record<string, unknown>>(
  toolName: string,
  authService: AuthService,
  handler: (token: string, args: TArgs) => Promise<TResult>,
  credential?: McpCredential
): (args: TArgs) => Promise<ToolResult> {
  return async (args) => {
    const logKey = credential
      ? credential.kind === 'api-key'
        ? credential.apiKey.slice(0, 24)
        : 'oauth'
      : 'none';
    const start = Date.now();

    try {
      const token = await resolveCredentialToken(
        authService,
        credential,
        toolName
      );

      const result = await handler(token, args);

      logToolCall(toolName, logKey, Date.now() - start, 'success');

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const errorCode =
        error instanceof ApiError ? String(error.status) : undefined;
      logToolCall(toolName, logKey, Date.now() - start, 'error', errorCode);
      return formatError(error);
    }
  };
}
