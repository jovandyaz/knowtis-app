import { serve } from '@hono/node-server';

import { AuthService } from './auth/auth-service.js';
import { parseConfig } from './config.js';
import { log } from './middleware/logger.js';
import { createMcpServer } from './server.js';
import { createApp } from './transport.js';

const config = parseConfig(process.env as Record<string, string | undefined>);
const authService = new AuthService(
  `${config.apiInternalUrl}/api/v1/auth/token-exchange`
);
const app = createApp(
  (apiKey) => createMcpServer({ config, authService, defaultApiKey: apiKey }),
  config
);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log({
    level: 'info',
    event: 'server_start',
    port: info.port,
    name: config.serverName,
    version: config.serverVersion,
  });
});
