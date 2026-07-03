import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { AuthService } from './auth/auth-service.js';
import { parseConfig } from './config.js';
import { createMcpServer } from './server.js';

const config = parseConfig({
  ...process.env,
  API_INTERNAL_URL: process.env.KNOWTIS_API_URL ?? process.env.API_INTERNAL_URL,
});

const defaultApiKey = process.env.KNOWTIS_API_KEY;
if (!defaultApiKey) {
  process.stderr.write(
    'Warning: KNOWTIS_API_KEY not set. Tool calls will fail without an API key.\n'
  );
}

const authService = new AuthService(
  `${config.apiInternalUrl}/api/v1/auth/token-exchange`
);
const server = createMcpServer({
  config,
  authService,
  credential: defaultApiKey
    ? { kind: 'api-key', apiKey: defaultApiKey }
    : undefined,
});
const transport = new StdioServerTransport();
await server.connect(transport);
