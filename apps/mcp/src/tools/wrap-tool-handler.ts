import { ApiError } from '../api-client/client.js';
import type { AuthService } from '../auth/auth-service.js';
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
    if (!credential) {
      return formatError(
        new Error(
          'No API key configured. Set KNOWTIS_API_KEY (stdio) or send an Authorization: Bearer header (HTTP).'
        )
      );
    }

    const logKey =
      credential.kind === 'api-key' ? credential.apiKey.slice(0, 24) : 'oauth';
    const start = Date.now();

    try {
      let token: string;
      if (credential.kind === 'api-key') {
        token = await authService.getToken(credential.apiKey);
        authService.checkScope(credential.apiKey, toolName);
      } else {
        authService.checkScopes(credential.scopes, toolName);
        token = credential.jwt;
      }

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
