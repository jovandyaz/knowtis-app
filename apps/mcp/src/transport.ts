import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

import type { AppConfig } from './config.js';

export function createApp(
  serverFactory: (apiKey?: string) => McpServer,
  config: AppConfig
): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());

  app.get('/health', (c) =>
    c.json({ status: 'ok', version: config.serverVersion })
  );

  app.all('/mcp', async (c) => {
    const apiKey = extractBearerToken(c.req.raw.headers);
    const server = serverFactory(apiKey);
    const transport = new WebStandardStreamableHTTPServerTransport({});
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return app;
}

function extractBearerToken(headers: Headers): string | undefined {
  const auth = headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return undefined;
  }
  return auth.slice(7);
}
