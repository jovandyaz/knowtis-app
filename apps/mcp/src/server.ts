import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { KnowtisApiClient } from './api-client/client.js';
import { NotesApi } from './api-client/notes.api.js';
import { SharingApi } from './api-client/sharing.api.js';
import type { AuthService } from './auth/auth-service.js';
import type { AppConfig } from './config.js';
import { registerNotesTools } from './tools/notes.tools.js';
import { registerSharingTools } from './tools/sharing.tools.js';

interface CreateMcpServerOptions {
  config: AppConfig;
  authService: AuthService;
  defaultApiKey?: string | undefined;
}

export function createMcpServer({
  config,
  authService,
  defaultApiKey,
}: CreateMcpServerOptions): McpServer {
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  const apiClient = new KnowtisApiClient(config.apiInternalUrl);
  const notesApi = new NotesApi(apiClient);
  const sharingApi = new SharingApi(apiClient);

  registerNotesTools(server, notesApi, authService, defaultApiKey);
  registerSharingTools(server, sharingApi, authService, defaultApiKey);

  return server;
}
