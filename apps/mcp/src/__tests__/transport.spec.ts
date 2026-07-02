import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../config.js';
import { createApp } from '../transport.js';

const config: AppConfig = {
  port: 3334,
  apiInternalUrl: 'http://localhost:3333',
  serverName: 'knowtis-mcp',
  serverVersion: '0.1.0',
  isDev: true,
};

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  },
});

function makeServer() {
  return new McpServer({ name: 'test', version: '0.0.0' });
}

describe('createApp', () => {
  it('should return 200 on /health without auth', async () => {
    const app = createApp(makeServer, config);
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('should reject /mcp without a Bearer token with 401 + WWW-Authenticate', async () => {
    const factory = vi.fn(makeServer);
    const app = createApp(factory, config);

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer');
    expect(factory).not.toHaveBeenCalled();
  });

  it('should serve an initialize request when a Bearer token is present', async () => {
    const factory = vi.fn(makeServer);
    const app = createApp(factory, config);

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer knowtis_mcp_test_key',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(200);
    expect(factory).toHaveBeenCalledWith('knowtis_mcp_test_key');
  });
});
