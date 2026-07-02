import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { SharingApi } from '../api-client/sharing.api.js';
import type { AuthService } from '../auth/auth-service.js';
import { wrapToolHandler } from './wrap-tool-handler.js';

const collaboratorShape = {
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  permission: z.enum(['owner', 'viewer', 'editor']),
};

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const SHARE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerSharingTools(
  server: McpServer,
  sharingApi: SharingApi,
  authService: AuthService,
  defaultApiKey?: string
): void {
  server.registerTool(
    'get-collaborators',
    {
      title: 'Get Collaborators',
      description:
        'List who has access to a note and their permission level (owner, editor, viewer).',
      inputSchema: {
        noteId: z.string().uuid().describe('The UUID of the note'),
      },
      outputSchema: { collaborators: z.array(z.object(collaboratorShape)) },
      annotations: READ_ONLY,
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

  server.registerTool(
    'share-note',
    {
      title: 'Share Note',
      description: 'Share a note with another user by their user ID.',
      inputSchema: {
        noteId: z.string().uuid().describe('The UUID of the note to share'),
        userId: z
          .string()
          .uuid()
          .describe('The UUID of the user to share with'),
        permission: z.enum(['viewer', 'editor']).describe('Permission level'),
      },
      outputSchema: { success: z.boolean() },
      annotations: SHARE,
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
