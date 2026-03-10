import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

import type { AppConfig } from './config.js';

export function createApp(
  serverFactory: () => McpServer,
  config: AppConfig
): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());

  app.get('/health', (c) =>
    c.json({ status: 'ok', version: config.serverVersion })
  );

  app.all('/mcp', async (c) => {
    const server = serverFactory();
    const transport = new WebStandardStreamableHTTPServerTransport({});
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return app;
}
