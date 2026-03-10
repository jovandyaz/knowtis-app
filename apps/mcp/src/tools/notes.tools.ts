import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NotesApi } from '../api-client/notes.api.js';
import type { AuthService } from '../auth/auth-service.js';
import { wrapToolHandler } from './wrap-tool-handler.js';

export function registerNotesTools(
  server: McpServer,
  notesApi: NotesApi,
  authService: AuthService,
  defaultApiKey?: string
): void {
  server.tool(
    'list-notes',
    "List user's notes with optional search filter. Returns title, id, and last modified date.",
    {
      search: z
        .string()
        .optional()
        .describe('Search query to filter notes by title or content'),
      limit: z.number().optional().default(20).describe('Max notes to return'),
    },
    wrapToolHandler(
      'list-notes',
      authService,
      (token, { search, limit }) => notesApi.list(token, search, limit),
      defaultApiKey
    )
  );

  server.tool(
    'get-note',
    'Get the full content of a specific note by ID.',
    {
      noteId: z.string().uuid().describe('The UUID of the note to retrieve'),
    },
    wrapToolHandler(
      'get-note',
      authService,
      (token, { noteId }) => notesApi.get(token, noteId),
      defaultApiKey
    )
  );

  server.tool(
    'create-note',
    'Create a new note with a title and optional content.',
    {
      title: z.string().min(1).describe('Title of the new note'),
      content: z.string().optional().describe('Initial content'),
    },
    wrapToolHandler(
      'create-note',
      authService,
      (token, { title, content }) => notesApi.create(token, title, content),
      defaultApiKey
    )
  );

  server.tool(
    'update-note',
    'Update the title or content of an existing note.',
    {
      noteId: z.string().uuid().describe('The UUID of the note to update'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New content'),
    },
    wrapToolHandler(
      'update-note',
      authService,
      (token, { noteId, title, content }) => {
        const data: { title?: string; content?: string } = {};
        if (title !== undefined) {
          data.title = title;
        }
        if (content !== undefined) {
          data.content = content;
        }
        return notesApi.update(token, noteId, data);
      },
      defaultApiKey
    )
  );

  server.tool(
    'delete-note',
    'Permanently delete a note. This action cannot be undone.',
    {
      noteId: z.string().uuid().describe('The UUID of the note to delete'),
    },
    wrapToolHandler(
      'delete-note',
      authService,
      async (token, { noteId }) => {
        await notesApi.delete(token, noteId);
        return { success: true, message: 'Note deleted.' };
      },
      defaultApiKey
    )
  );
}
