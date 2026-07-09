import { describe, expect, it, vi } from 'vitest';

import pkg from '../../package.json';
import { parseConfig, resolveApiUrl } from '../config.js';
import { logOauthConfig } from '../middleware/logger.js';

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

  it('should not require hosts or origins when requireHttpSecurity is false', () => {
    expect(() =>
      parseConfig(
        {
          API_INTERNAL_URL: 'http://localhost:3333',
          NODE_ENV: 'production',
        },
        { requireHttpSecurity: false }
      )
    ).not.toThrow();
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

  it('should emit oauth_config_loaded echoing the resolved issuer and resourceUrl', () => {
    const config = parseConfig({
      API_INTERNAL_URL: 'http://localhost:3333',
      MCP_OAUTH_ISSUER: 'https://api.knowtis.app/',
      MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp/',
    });
    const { oauth } = config;
    if (!oauth) {
      throw new Error('expected oauth config to be populated');
    }

    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    let callCount: number;
    let written: string;
    try {
      logOauthConfig(oauth.issuer, oauth.resourceUrl);
      callCount = writeSpy.mock.calls.length;
      written = String(writeSpy.mock.calls[0]?.[0] ?? '');
    } finally {
      writeSpy.mockRestore();
    }

    expect(callCount).toBe(1);
    const line = JSON.parse(written);
    expect(line).toMatchObject({
      level: 'info',
      event: 'oauth_config_loaded',
      issuer: 'https://api.knowtis.app',
      resourceUrl: 'https://mcp.knowtis.app/mcp',
    });
  });
});

describe('resolveApiUrl', () => {
  it('should prefer KNOWTIS_API_URL when set', () => {
    expect(
      resolveApiUrl({
        KNOWTIS_API_URL: 'https://custom.example.com',
        API_INTERNAL_URL: 'http://localhost:3333',
      })
    ).toBe('https://custom.example.com');
  });

  it('should fall back to API_INTERNAL_URL when KNOWTIS_API_URL is unset', () => {
    expect(resolveApiUrl({ API_INTERNAL_URL: 'http://localhost:3333' })).toBe(
      'http://localhost:3333'
    );
  });

  it('should treat empty KNOWTIS_API_URL as absent and use the default', () => {
    expect(resolveApiUrl({ KNOWTIS_API_URL: '' })).toBe(
      'https://api.knowtis.app'
    );
  });

  it('should default to the production API url when nothing is set', () => {
    expect(resolveApiUrl({})).toBe('https://api.knowtis.app');
  });
});
