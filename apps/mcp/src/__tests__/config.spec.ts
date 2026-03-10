import { describe, expect, it } from 'vitest';

import { parseConfig } from '../config.js';

describe('parseConfig', () => {
  it('should parse valid config from env', () => {
    const env = {
      PORT: '3334',
      API_INTERNAL_URL: 'http://localhost:3333',
      MCP_SERVER_NAME: 'knowtis-mcp',
      MCP_SERVER_VERSION: '1.0.0',
    };
    const config = parseConfig(env);
    expect(config.port).toBe(3334);
    expect(config.apiInternalUrl).toBe('http://localhost:3333');
  });

  it('should use defaults when optional values missing', () => {
    const env = {
      API_INTERNAL_URL: 'http://localhost:3333',
    };
    const config = parseConfig(env);
    expect(config.port).toBe(3334);
    expect(config.serverName).toBe('knowtis-mcp');
  });

  it('should throw on missing required API_INTERNAL_URL', () => {
    expect(() => parseConfig({})).toThrow();
  });
});
