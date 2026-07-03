import { describe, expect, it } from 'vitest';

import pkg from '../../package.json';
import { parseConfig } from '../config.js';

describe('parseConfig', () => {
  it('should parse valid config from env', () => {
    const env = {
      PORT: '3334',
      API_INTERNAL_URL: 'http://localhost:3333',
      MCP_SERVER_NAME: 'knowtis-mcp',
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

  it('should report the package.json version as serverVersion', () => {
    const config = parseConfig({ API_INTERNAL_URL: 'http://localhost:3333' });
    expect(config.serverVersion).toBe(pkg.version);
  });

  it('should ignore MCP_SERVER_VERSION from the environment', () => {
    const config = parseConfig({
      API_INTERNAL_URL: 'http://localhost:3333',
      MCP_SERVER_VERSION: '9.9.9',
    });
    expect(config.serverVersion).toBe(pkg.version);
  });

  it('should default allowed hosts to localhost in development', () => {
    const config = parseConfig({ API_INTERNAL_URL: 'http://localhost:3333' });
    expect(config.allowedHosts).toEqual(['localhost:3334', '127.0.0.1:3334']);
    expect(config.enableDnsRebindingProtection).toBe(true);
  });

  it('should parse MCP_ALLOWED_HOSTS as a comma-separated list', () => {
    const config = parseConfig({
      API_INTERNAL_URL: 'http://localhost:3333',
      NODE_ENV: 'production',
      MCP_ALLOWED_HOSTS: 'mcp.knowtis.app, mcp-staging.knowtis.app',
    });
    expect(config.allowedHosts).toEqual([
      'mcp.knowtis.app',
      'mcp-staging.knowtis.app',
    ]);
    expect(config.enableDnsRebindingProtection).toBe(true);
  });

  it('should throw in production when no hosts or origins are configured', () => {
    expect(() =>
      parseConfig({
        API_INTERNAL_URL: 'http://localhost:3333',
        NODE_ENV: 'production',
      })
    ).toThrow(/MCP_ALLOWED_HOSTS or MCP_ALLOWED_ORIGINS/);
  });

  it('should strip trailing slashes from API_INTERNAL_URL', () => {
    const config = parseConfig({ API_INTERNAL_URL: 'http://localhost:3333/' });
    expect(config.apiInternalUrl).toBe('http://localhost:3333');
  });

  it('should enable rebinding protection from origins alone', () => {
    const config = parseConfig({
      API_INTERNAL_URL: 'http://localhost:3333',
      NODE_ENV: 'production',
      MCP_ALLOWED_ORIGINS: 'https://app.knowtis.app',
    });
    expect(config.allowedHosts).toEqual([]);
    expect(config.allowedOrigins).toEqual(['https://app.knowtis.app']);
    expect(config.enableDnsRebindingProtection).toBe(true);
  });

  it('should leave oauth null when the OAuth envs are absent', () => {
    const config = parseConfig({ API_INTERNAL_URL: 'http://localhost:3333' });
    expect(config.oauth).toBeNull();
  });

  it('should treat empty OAuth env strings as absent', () => {
    const config = parseConfig({
      API_INTERNAL_URL: 'http://localhost:3333',
      MCP_OAUTH_ISSUER: '',
      MCP_RESOURCE_URL: '',
    });
    expect(config.oauth).toBeNull();
  });

  it('should populate oauth with derived jwks and metadata urls', () => {
    const config = parseConfig({
      API_INTERNAL_URL: 'http://localhost:3333',
      MCP_OAUTH_ISSUER: 'https://api.knowtis.app',
      MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
    });
    expect(config.oauth).toEqual({
      issuer: 'https://api.knowtis.app',
      resourceUrl: 'https://mcp.knowtis.app/mcp',
      jwksUrl: 'https://api.knowtis.app/oauth/jwks',
      metadataUrl:
        'https://mcp.knowtis.app/.well-known/oauth-protected-resource',
    });
  });

  it('should strip trailing slashes from the resource url and issuer', () => {
    const config = parseConfig({
      API_INTERNAL_URL: 'http://localhost:3333',
      MCP_OAUTH_ISSUER: 'https://api.knowtis.app/',
      MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp/',
    });
    expect(config.oauth?.resourceUrl).toBe('https://mcp.knowtis.app/mcp');
    expect(config.oauth?.jwksUrl).toBe('https://api.knowtis.app/oauth/jwks');
  });

  it('should throw when only one OAuth env is set', () => {
    expect(() =>
      parseConfig({
        API_INTERNAL_URL: 'http://localhost:3333',
        MCP_OAUTH_ISSUER: 'https://api.knowtis.app',
      })
    ).toThrow(/MCP_OAUTH_ISSUER and MCP_RESOURCE_URL/);
  });
});
