import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, it } from 'vitest';

import { KnowtisApiClient } from '../api-client/client.js';
import { SharingApi } from '../api-client/sharing.api.js';
import { AuthService } from '../auth/auth-service.js';
import { registerSharingTools } from '../tools/sharing.tools.js';

describe('Sharing Tools', () => {
  it('should register sharing tools without error', () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    const client = new KnowtisApiClient('http://test:3333');
    const sharingApi = new SharingApi(client);
    const authService = new AuthService(
      'http://test:3333/api/v1/auth/token-exchange'
    );

    registerSharingTools(server, sharingApi, authService);
  });
});
