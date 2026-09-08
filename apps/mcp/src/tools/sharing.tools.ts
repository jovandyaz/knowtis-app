import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { SharingApi } from '../api-client/sharing.api.js';
import type { AuthService } from '../auth/auth-service.js';
import type { McpCredential } from '../auth/credentials.js';
import { NON_DESTRUCTIVE_IDEMPOTENT, READ_ONLY } from './annotations.js';
import { wrapToolHandler } from './wrap-tool-handler.js';

const personShape = {
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  permission: z.enum(['owner', 'viewer', 'editor']),
};

export function registerSharingTools(
  server: McpServer,
  sharingApi: SharingApi,
  authService: AuthService,
  credential?: McpCredential
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
      outputSchema: { collaborators: z.array(z.object(personShape)) },
      annotations: READ_ONLY,
    },
    wrapToolHandler(
      'get-collaborators',
      authService,
      async (token, { noteId }) => ({
        collaborators: await sharingApi.getPeople(token, noteId),
      }),
      credential
    )
  );

  server.registerTool(
    'share-note',
    {
      title: 'Share Note',
      description: 'Add a person to a note by their exact email address.',
      inputSchema: {
        noteId: z.string().uuid().describe('The UUID of the note to share'),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email()
          .describe('The exact email address of the person'),
        permission: z.enum(['viewer', 'editor']).describe('Permission level'),
      },
      outputSchema: { success: z.boolean() },
      annotations: NON_DESTRUCTIVE_IDEMPOTENT,
    },
    wrapToolHandler(
      'share-note',
      authService,
      async (token, { noteId, email, permission }) => {
        await sharingApi.upsertPerson(token, noteId, { email, permission });
        return { success: true };
      },
      credential
    )
  );
}
