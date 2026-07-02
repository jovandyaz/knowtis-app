import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { SharingApi } from '../api-client/sharing.api.js';
import type { AuthService } from '../auth/auth-service.js';
import { wrapToolHandler } from './wrap-tool-handler.js';

export function registerSharingTools(
  server: McpServer,
  sharingApi: SharingApi,
  authService: AuthService,
  defaultApiKey?: string
): void {
  server.tool(
    'get-collaborators',
    'List who has access to a note and their permission level (owner, editor, viewer).',
    {
      noteId: z.string().uuid().describe('The UUID of the note'),
    },
    wrapToolHandler(
      'get-collaborators',
      authService,
      async (token, { noteId }) => ({
        collaborators: await sharingApi.getCollaborators(token, noteId),
      }),
      defaultApiKey
    )
  );

  server.tool(
    'share-note',
    'Share a note with another user by their user ID.',
    {
      noteId: z.string().uuid().describe('The UUID of the note to share'),
      userId: z.string().uuid().describe('The UUID of the user to share with'),
      permission: z.enum(['viewer', 'editor']).describe('Permission level'),
    },
    wrapToolHandler(
      'share-note',
      authService,
      async (token, { noteId, userId, permission }) => {
        await sharingApi.share(token, noteId, userId, permission);
        return { success: true };
      },
      defaultApiKey
    )
  );
}
