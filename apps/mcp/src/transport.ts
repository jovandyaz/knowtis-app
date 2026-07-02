import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import type { AppConfig } from './config.js';

export function createApp(
  serverFactory: (apiKey: string) => McpServer,
  config: AppConfig
): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());

  app.use(
    '/mcp',
    cors({
      origin: '*',
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Mcp-Session-Id',
        'MCP-Protocol-Version',
      ],
      exposeHeaders: ['Mcp-Session-Id'],
    })
  );

  app.get('/health', (c) =>
    c.json({ status: 'ok', version: config.serverVersion })
  );

  app.all('/mcp', async (c) => {
    const apiKey = extractBearerToken(c.req.raw.headers);
    if (!apiKey) {
      return c.json(
        {
          error: 'unauthorized',
          message:
            'Provide a Knowtis MCP API key as a Bearer token. Create one in the Knowtis app under Settings > Integrations.',
        },
        401,
        {
          'WWW-Authenticate':
            'Bearer realm="knowtis-mcp", error="invalid_token"',
        }
      );
    }
    const server = serverFactory(apiKey);
    const transport = new WebStandardStreamableHTTPServerTransport({
      allowedHosts: config.allowedHosts,
      allowedOrigins: config.allowedOrigins,
      enableDnsRebindingProtection: config.enableDnsRebindingProtection,
    });
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
