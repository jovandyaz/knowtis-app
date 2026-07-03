import { serve } from '@hono/node-server';

import { AuthService } from './auth/auth-service.js';
import { OauthVerifier } from './auth/oauth-verifier.js';
import { parseConfig } from './config.js';
import { log, logOauthConfig } from './middleware/logger.js';
import { createMcpServer } from './server.js';
import { createApp } from './transport.js';

const config = parseConfig(process.env as Record<string, string | undefined>);
if (config.oauth) {
  logOauthConfig(config.oauth.issuer, config.oauth.resourceUrl);
}
const authService = new AuthService(
  `${config.apiInternalUrl}/api/v1/auth/token-exchange`
);
const oauthVerifier = config.oauth
  ? new OauthVerifier(config.oauth)
  : undefined;
const app = createApp(
  (credential) => createMcpServer({ config, authService, credential }),
  config,
  oauthVerifier
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
