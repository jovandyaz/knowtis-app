import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { NotesApi } from '../api-client/notes.api.js';
import type { AuthService } from '../auth/auth-service.js';
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
  if (credential.kind === 'api-key') {
    const token = await authService.getToken(credential.apiKey);
    authService.checkScope(credential.apiKey, 'note-resource');
    return token;
  }
  authService.checkScopes(credential.scopes, 'note-resource');
  return credential.jwt;
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
      const note = await notesApi.get(token, match[1]);
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: 'text/markdown',
            text: `# ${note.title}\n\n${htmlToMarkdown(note.content)}`,
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
