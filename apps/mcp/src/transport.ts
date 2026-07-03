import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import type { AppConfig, OauthConfig } from './config.js';

const SUPPORTED_SCOPES = ['notes:read', 'notes:write', 'notes:share'] as const;

export function createApp(
  serverFactory: (apiKey: string) => McpServer,
  config: AppConfig
): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());

  app.use(
    '/mcp',
    cors({
      origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : '*',
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Mcp-Session-Id',
        'MCP-Protocol-Version',
      ],
      exposeHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
    })
  );

  if (config.oauth) {
    const metadata = buildProtectedResourceMetadata(config.oauth);
    app.use('/.well-known/*', cors({ origin: '*' }));
    app.get('/.well-known/oauth-protected-resource', (c) => c.json(metadata));
    app.get('/.well-known/oauth-protected-resource/mcp', (c) =>
      c.json(metadata)
    );
  }

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
          'WWW-Authenticate': buildChallenge(config.oauth),
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

function buildProtectedResourceMetadata(oauth: OauthConfig) {
  return {
    resource: oauth.resourceUrl,
    authorization_servers: [oauth.issuer],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Knowtis MCP',
  };
}

function buildChallenge(oauth: OauthConfig | null): string {
  if (!oauth) {
    return 'Bearer realm="knowtis-mcp"';
  }
  return `Bearer resource_metadata="${oauth.metadataUrl}", scope="notes:read"`;
}
