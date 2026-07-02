import { ApiError } from '../api-client/client.js';
import type { AuthService } from '../auth/auth-service.js';
import { logToolCall } from '../middleware/logger.js';
import { formatError } from './format-error.js';

interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function wrapToolHandler<TArgs>(
  toolName: string,
  authService: AuthService,
  handler: (token: string, args: TArgs) => Promise<unknown>,
  fallbackApiKey?: string
): (args: TArgs) => Promise<ToolResult> {
  return async (args) => {
    const apiKey = fallbackApiKey;

    if (!apiKey) {
      return formatError(
        new Error(
          'No API key configured. Set KNOWTIS_API_KEY (stdio) or send an Authorization: Bearer header (HTTP).'
        )
      );
    }

    const apiKeyPrefix = apiKey.slice(0, 24);
    const start = Date.now();

    try {
      const token = await authService.getToken(apiKey);
      authService.checkScope(apiKey, toolName);
      const result = await handler(token, args);

      logToolCall(toolName, apiKeyPrefix, Date.now() - start, 'success');

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (error) {
      const errorCode =
        error instanceof ApiError ? String(error.status) : undefined;
      logToolCall(
        toolName,
        apiKeyPrefix,
        Date.now() - start,
        'error',
        errorCode
      );
      return formatError(error);
    }
  };
}
