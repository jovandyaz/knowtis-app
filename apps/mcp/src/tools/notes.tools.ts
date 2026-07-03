import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NotesApi } from '../api-client/notes.api.js';
import type { AuthService } from '../auth/auth-service.js';
import type { McpCredential } from '../auth/credentials.js';
import { markdownToHtml } from '../utils/markdown-to-html.js';
import {
  DESTRUCTIVE_IDEMPOTENT,
  NON_DESTRUCTIVE,
  READ_ONLY,
} from './annotations.js';
import { wrapToolHandler } from './wrap-tool-handler.js';

const noteSummaryShape = {
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
};

const noteShape = {
  id: z.string(),
  title: z.string(),
  content: z.string(),
  ownerId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export function registerNotesTools(
  server: McpServer,
  notesApi: NotesApi,
  authService: AuthService,
  credential?: McpCredential
): void {
  server.registerTool(
    'list-notes',
    {
      title: 'List Notes',
      description:
        "List user's notes with optional search filter. Returns title, id, and last modified date.",
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe('Search query to filter notes by title or content'),
      },
      outputSchema: { notes: z.array(z.object(noteSummaryShape)) },
      annotations: READ_ONLY,
    },
    wrapToolHandler(
      'list-notes',
      authService,
      async (token, { search }) => {
        const notes = await notesApi.list(token, search);
        return {
          notes: notes.map(({ id, title, updatedAt }) => ({
            id,
            title,
            updatedAt,
          })),
        };
      },
      credential
    )
  );

  server.registerTool(
    'get-note',
    {
      title: 'Get Note',
      description: 'Get the full content of a specific note by ID.',
      inputSchema: {
        noteId: z.string().uuid().describe('The UUID of the note to retrieve'),
      },
      outputSchema: { note: z.object(noteShape) },
      annotations: READ_ONLY,
    },
    wrapToolHandler(
      'get-note',
      authService,
      async (token, { noteId }) => ({
        note: await notesApi.get(token, noteId),
      }),
      credential
    )
  );

  server.registerTool(
    'create-note',
    {
      title: 'Create Note',
      description:
        'Create a new note with a title and optional Markdown content. Supports: headings (#, ##, ###), **bold**, *italic*, ~~strikethrough~~, `inline code`, fenced code blocks (```lang), [links](url), lists (-, 1.), task lists (- [ ], - [x]), blockquotes (>), horizontal rules (---), GFM tables (| col | col |), highlight (==text==), superscript (^text^), subscript (~text~), and Mermaid diagrams (```mermaid ... ```).',
      inputSchema: {
        title: z.string().min(1).describe('Title of the new note'),
        content: z
          .string()
          .optional()
          .describe(
            'Note content in Markdown format. Use standard Markdown syntax for rich formatting.'
          ),
      },
      outputSchema: { note: z.object(noteShape) },
      annotations: NON_DESTRUCTIVE,
    },
    wrapToolHandler(
      'create-note',
      authService,
      async (token, { title, content }) => ({
        note: await notesApi.create(
          token,
          title,
          content ? markdownToHtml(content) : undefined
        ),
      }),
      credential
    )
  );

  server.registerTool(
    'update-note',
    {
      title: 'Update Note',
      description:
        'Update the title or content of an existing note. Content should be in Markdown format (same syntax supported as create-note: headings, bold/italic/strike/code, lists, task lists, tables, blockquotes, highlight, super/subscript, Mermaid diagrams).',
      inputSchema: {
        noteId: z.string().uuid().describe('The UUID of the note to update'),
        title: z.string().optional().describe('New title'),
        content: z
          .string()
          .optional()
          .describe(
            'New content in Markdown format. This replaces the entire note content.'
          ),
      },
      outputSchema: { note: z.object(noteShape) },
      annotations: DESTRUCTIVE_IDEMPOTENT,
    },
    wrapToolHandler(
      'update-note',
      authService,
      async (token, { noteId, title, content }) => {
        const data: { title?: string; content?: string } = {};
        if (title !== undefined) {
          data.title = title;
        }
        if (content !== undefined) {
          data.content = markdownToHtml(content);
        }
        return { note: await notesApi.update(token, noteId, data) };
      },
      credential
    )
  );

  server.registerTool(
    'delete-note',
    {
      title: 'Delete Note',
      description: 'Permanently delete a note. This action cannot be undone.',
      inputSchema: {
        noteId: z.string().uuid().describe('The UUID of the note to delete'),
      },
      outputSchema: { success: z.boolean(), message: z.string() },
      annotations: DESTRUCTIVE_IDEMPOTENT,
    },
    wrapToolHandler(
      'delete-note',
      authService,
      async (token, { noteId }) => {
        await notesApi.delete(token, noteId);
        return { success: true, message: 'Note deleted.' };
      },
      credential
    )
  );
}
