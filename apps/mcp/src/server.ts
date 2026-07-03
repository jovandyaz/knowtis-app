import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { KnowtisApiClient } from './api-client/client.js';
import { NotesApi } from './api-client/notes.api.js';
import { SharingApi } from './api-client/sharing.api.js';
import type { AuthService } from './auth/auth-service.js';
import type { McpCredential } from './auth/credentials.js';
import type { AppConfig } from './config.js';
import { registerNotesTools } from './tools/notes.tools.js';
import { registerSharingTools } from './tools/sharing.tools.js';

interface CreateMcpServerOptions {
  config: AppConfig;
  authService: AuthService;
  credential?: McpCredential | undefined;
}

export function createMcpServer({
  config,
  authService,
  credential,
}: CreateMcpServerOptions): McpServer {
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  const apiClient = new KnowtisApiClient(config.apiInternalUrl);
  const notesApi = new NotesApi(apiClient);
  const sharingApi = new SharingApi(apiClient);

  registerNotesTools(server, notesApi, authService, credential);
  registerSharingTools(server, sharingApi, authService, credential);

  return server;
}
