import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ApiError } from '../api-client/client.js';
import type { NotesApi } from '../api-client/notes.api.js';
import type { AuthService } from '../auth/auth-service.js';
import { resolveCredentialToken } from '../auth/auth-service.js';
import type { McpCredential } from '../auth/credentials.js';
import { htmlToMarkdown } from '../utils/html-to-markdown.js';
import { paginateByRecency } from '../utils/note-cursor.js';

const NOTE_URI_PATTERN =
  /^knowtis:\/\/notes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const PAGE_SIZE = 20;

async function resolveToken(
  authService: AuthService,
  credential: McpCredential | undefined
): Promise<string> {
  if (!credential) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'No API key configured. Set KNOWTIS_API_KEY (stdio) or send an Authorization: Bearer header (HTTP).'
    );
  }
  return resolveCredentialToken(authService, credential, 'note-resource');
}

function apiErrorToMcpError(error: ApiError): McpError {
  switch (error.status) {
    case 404:
      return new McpError(ErrorCode.InvalidParams, 'Note not found.');
    case 403:
      return new McpError(
        ErrorCode.InvalidRequest,
        "You don't have permission to perform this action."
      );
    case 401:
      return new McpError(
        ErrorCode.InvalidRequest,
        'Authentication failed. Your API key may be invalid or expired.'
      );
    default:
      return new McpError(ErrorCode.InternalError, 'Failed to read the note.');
  }
}

/**
 * Registers resources/list (cursor-paginated), resources/read (Markdown) and
 * resources/templates/list via low-level handlers: the SDK's registerResource
 * path drops both the incoming cursor and the returned nextCursor (1.29.0).
 */
export function registerNoteResources(
  server: McpServer,
  notesApi: NotesApi,
  authService: AuthService,
  credential?: McpCredential
): void {
  server.server.setRequestHandler(
    ListResourcesRequestSchema,
    async (request) => {
      const token = await resolveToken(authService, credential);
      const notes = await notesApi.list(token);
      const { page, nextCursor } = paginateByRecency(
        notes,
        PAGE_SIZE,
        request.params?.cursor
      );
      return {
        resources: page.map((note) => ({
          uri: `knowtis://notes/${note.id}`,
          name: note.title,
          mimeType: 'text/markdown',
        })),
        ...(nextCursor ? { nextCursor } : {}),
      };
    }
  );

  server.server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request) => {
      const match = NOTE_URI_PATTERN.exec(request.params.uri);
      if (!match) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid note URI: ${request.params.uri}. Expected knowtis://notes/{noteId}.`
        );
      }
      const token = await resolveToken(authService, credential);
      let note;
      try {
        note = await notesApi.get(token, match[1]);
      } catch (error) {
        if (error instanceof ApiError) {
          throw apiErrorToMcpError(error);
        }
        throw error;
      }
      const heading = note.title.replace(/\s+/g, ' ').trim();
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: 'text/markdown',
            text: `# ${heading}\n\n${htmlToMarkdown(note.content)}`,
          },
        ],
      };
    }
  );

  server.server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: [
      {
        uriTemplate: 'knowtis://notes/{noteId}',
        name: 'Knowtis note',
        description: 'A note as Markdown, addressable by its UUID',
        mimeType: 'text/markdown',
      },
    ],
  }));
}
