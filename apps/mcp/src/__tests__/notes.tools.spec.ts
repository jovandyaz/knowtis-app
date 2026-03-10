import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, it } from 'vitest';

import { KnowtisApiClient } from '../api-client/client.js';
import { NotesApi } from '../api-client/notes.api.js';
import { AuthService } from '../auth/auth-service.js';
import { registerNotesTools } from '../tools/notes.tools.js';

describe('Notes Tools', () => {
  it('should register all notes tools on the MCP server', () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const client = new KnowtisApiClient('http://test:3333');
    const notesApi = new NotesApi(client);
    const authService = new AuthService(
      'http://test:3333/api/v1/auth/token-exchange'
    );

    registerNotesTools(server, notesApi, authService);
  });
});
