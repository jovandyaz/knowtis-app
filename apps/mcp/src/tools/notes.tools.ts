import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { NotesApi } from '../api-client/notes.api.js';
import type { SearchApi } from '../api-client/search.api.js';
import type { AuthService } from '../auth/auth-service.js';
import type { McpCredential } from '../auth/credentials.js';
import { htmlToMarkdown } from '../utils/html-to-markdown.js';
import { markdownToHtml } from '../utils/markdown-to-html.js';
import { decodePageCursor, nextPageCursor } from '../utils/note-cursor.js';
import {
  DESTRUCTIVE_IDEMPOTENT,
  NON_DESTRUCTIVE,
  NON_DESTRUCTIVE_IDEMPOTENT,
  READ_ONLY,
} from './annotations.js';
import { wrapToolHandler } from './wrap-tool-handler.js';

const DEFAULT_LIST_NOTES_LIMIT = 20;

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

const searchHitShape = {
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  isOwner: z.boolean(),
  isSharedWithMe: z.boolean(),
  isPubliclyShared: z.boolean(),
};

export function registerNotesTools(
  server: McpServer,
  notesApi: NotesApi,
  searchApi: SearchApi,
  authService: AuthService,
  credential?: McpCredential
): void {
  server.registerTool(
    'list-notes',
    {
      title: 'List Notes',
      description:
        "List user's notes ordered by recency. Use cursor from a previous " +
        'call to fetch the next page; prefer search-notes for content lookup.',
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe('Search query to filter notes by title or content'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Page size (default 20)'),
        cursor: z
          .string()
          .optional()
          .describe('Opaque cursor from a previous list-notes call'),
      },
      outputSchema: {
        notes: z.array(z.object(noteSummaryShape)),
        nextCursor: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    wrapToolHandler(
      'list-notes',
      authService,
      async (token, { search, limit, cursor }) => {
        const envelope = await notesApi.list(token, {
          ...(search ? { search } : {}),
          page: decodePageCursor(cursor),
          limit: limit ?? DEFAULT_LIST_NOTES_LIMIT,
        });
        const next = nextPageCursor(envelope);
        return {
          notes: envelope.items.map(({ id, title, updatedAt }) => ({
            id,
            title,
            updatedAt,
          })),
          ...(next ? { nextCursor: next } : {}),
        };
      },
      credential
    )
  );

  server.registerTool(
    'search-notes',
    {
      title: 'Search Notes',
      description:
        'Search across all accessible notes by meaning and keywords ' +
        '(hybrid full-text + semantic). Returns the most relevant notes; ' +
        'use get-note to read a result.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .describe('What to look for, e.g. "budget decisions from June"'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Maximum hits to return (default 20)'),
      },
      outputSchema: { hits: z.array(z.object(searchHitShape)) },
      annotations: READ_ONLY,
    },
    wrapToolHandler(
      'search-notes',
      authService,
      async (token, { query, limit }) => ({
        hits: await searchApi.search(token, query, limit),
      }),
      credential
    )
  );

  server.registerTool(
    'get-note',
    {
      title: 'Get Note',
      description:
        'Get the full content of a specific note by ID. Content is returned as Markdown.',
      inputSchema: {
        noteId: z.string().uuid().describe('The UUID of the note to retrieve'),
      },
      outputSchema: { note: z.object(noteShape) },
      annotations: READ_ONLY,
    },
    wrapToolHandler(
      'get-note',
      authService,
      async (token, { noteId }) => {
        const note = await notesApi.get(token, noteId);
        return { note: { ...note, content: htmlToMarkdown(note.content) } };
      },
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
      async (token, { title, content }) => {
        const note = await notesApi.create(
          token,
          title,
          content ? markdownToHtml(content) : undefined
        );
        return { note: { ...note, content: htmlToMarkdown(note.content) } };
      },
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
        const note = await notesApi.update(token, noteId, data);
        return { note: { ...note, content: htmlToMarkdown(note.content) } };
      },
      credential
    )
  );

  server.registerTool(
    'delete-note',
    {
      title: 'Delete Note',
      description:
        'Delete a note. The note is soft-deleted and can be restored with restore-note.',
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

  server.registerTool(
    'restore-note',
    {
      title: 'Restore Note',
      description:
        'Restore a soft-deleted note (undoes delete-note). Only the owner can restore.',
      inputSchema: {
        noteId: z.string().uuid().describe('The UUID of the note to restore'),
      },
      outputSchema: { note: z.object(noteShape) },
      annotations: NON_DESTRUCTIVE_IDEMPOTENT,
    },
    wrapToolHandler(
      'restore-note',
      authService,
      async (token, { noteId }) => {
        const note = await notesApi.restore(token, noteId);
        return { note: { ...note, content: htmlToMarkdown(note.content) } };
      },
      credential
    )
  );
}
