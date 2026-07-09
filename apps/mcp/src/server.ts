import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { KnowtisApiClient } from './api-client/client.js';
import { NotesApi } from './api-client/notes.api.js';
import { SearchApi } from './api-client/search.api.js';
import { SharingApi } from './api-client/sharing.api.js';
import type { AuthService } from './auth/auth-service.js';
import type { McpCredential } from './auth/credentials.js';
import type { AppConfig } from './config.js';
import { registerNoteResources } from './resources/note-resources.js';
import { registerNotesTools } from './tools/notes.tools.js';
import { registerSharingTools } from './tools/sharing.tools.js';

interface CreateMcpServerOptions {
  config: AppConfig;
  authService: AuthService;
  credential?: McpCredential | undefined;
}

const SERVER_INSTRUCTIONS = [
  'Knowtis is a collaborative notes platform.',
  'Typical workflow: search-notes to find relevant notes by meaning or keywords,',
  'get-note to read one (content is Markdown), then update-note or create-note',
  '(both accept Markdown). list-notes pages by recency with an opaque cursor.',
  'Notes are also exposed as resources at knowtis://notes/{noteId} for use as context.',
].join(' ');

export function createMcpServer({
  config,
  authService,
  credential,
}: CreateMcpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: config.serverName,
      version: config.serverVersion,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { resources: {} },
    }
  );

  const apiClient = new KnowtisApiClient(config.apiInternalUrl);
  const notesApi = new NotesApi(apiClient);
  const searchApi = new SearchApi(apiClient);
  const sharingApi = new SharingApi(apiClient);

  registerNotesTools(server, notesApi, searchApi, authService, credential);
  registerSharingTools(server, sharingApi, authService, credential);
  registerNoteResources(server, notesApi, authService, credential);

  return server;
}
