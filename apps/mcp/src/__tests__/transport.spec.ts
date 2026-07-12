import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import type { OauthVerifier } from '../auth/oauth-verifier.js';
import type { AppConfig } from '../config.js';
import { createApp } from '../transport.js';

function mockVerifier(
  verify: OauthVerifier['verify'] = vi.fn()
): OauthVerifier {
  return { verify } as unknown as OauthVerifier;
}

const config: AppConfig = {
  port: 3334,
  apiInternalUrl: 'http://localhost:3333',
  serverName: 'knowtis-mcp',
  serverVersion: '0.1.0',
  isDev: true,
  allowedHosts: [],
  allowedOrigins: [],
  enableDnsRebindingProtection: false,
  oauth: null,
};

const oauthConfig: AppConfig = {
  ...config,
  oauth: {
    issuer: 'https://api.knowtis.app',
    resourceUrl: 'https://mcp.knowtis.app/mcp',
    jwksUrl: 'https://api.knowtis.app/oauth/jwks',
    metadataUrl: 'https://mcp.knowtis.app/.well-known/oauth-protected-resource',
  },
};

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  },
});

function makeServer() {
  return new McpServer({ name: 'test', version: '0.0.0' });
}

describe('createApp', () => {
  it('should return 200 on /health without auth', async () => {
    const app = createApp(makeServer, config);
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('should reject /mcp without a Bearer token with 401 + WWW-Authenticate', async () => {
    const factory = vi.fn(makeServer);
    const app = createApp(factory, config);

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="knowtis-mcp"'
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it('should serve an initialize request when a Bearer token is present', async () => {
    const factory = vi.fn(makeServer);
    const app = createApp(factory, config);

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer knowtis_mcp_test_key',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(200);
    expect(factory).toHaveBeenCalledWith({
      kind: 'api-key',
      apiKey: 'knowtis_mcp_test_key',
    });
  });

  it('should treat any bearer token as an api-key credential when oauth is not configured', async () => {
    const factory = vi.fn(makeServer);
    const app = createApp(factory, config);

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer some-opaque-oauth-looking-token',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(200);
    expect(factory).toHaveBeenCalledWith({
      kind: 'api-key',
      apiKey: 'some-opaque-oauth-looking-token',
    });
  });

  it('should verify an oauth bearer token and serve the request with an oauth credential', async () => {
    const factory = vi.fn(makeServer);
    const verify = vi.fn().mockResolvedValue({ scopes: ['notes:read'] });
    const app = createApp(factory, oauthConfig, mockVerifier(verify));

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer valid.oauth.jwt',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(200);
    expect(verify).toHaveBeenCalledWith('valid.oauth.jwt');
    expect(factory).toHaveBeenCalledWith({
      kind: 'oauth',
      jwt: 'valid.oauth.jwt',
      scopes: ['notes:read'],
    });
  });

  it('should pass an api-key bearer through without verification when oauth is configured', async () => {
    const factory = vi.fn(makeServer);
    const verify = vi.fn();
    const app = createApp(factory, oauthConfig, mockVerifier(verify));

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer knowtis_mcp_live_key',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledWith({
      kind: 'api-key',
      apiKey: 'knowtis_mcp_live_key',
    });
  });

  it('should reject an invalid oauth token with 401 invalid_token and resource_metadata', async () => {
    const factory = vi.fn(makeServer);
    const verify = vi.fn().mockRejectedValue(new Error('signature mismatch'));
    const app = createApp(factory, oauthConfig, mockVerifier(verify));

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer tampered.oauth.jwt',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(401);
    const challenge = res.headers.get('WWW-Authenticate');
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain(
      'resource_metadata="https://mcp.knowtis.app/.well-known/oauth-protected-resource"'
    );
    expect((await res.json()).error).toBe('invalid_token');
    expect(factory).not.toHaveBeenCalled();
  });

  it('should reject requests with a non-allowlisted Host header', async () => {
    const app = createApp(makeServer, {
      ...config,
      allowedHosts: ['localhost:3334'],
      enableDnsRebindingProtection: true,
    });

    const res = await app.request('http://evil.example.com/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer knowtis_mcp_test_key',
        Host: 'evil.example.com',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(403);
  });

  it('should serve requests with an allowlisted Host header when protection is on', async () => {
    const app = createApp(makeServer, {
      ...config,
      allowedHosts: ['localhost:3334'],
      enableDnsRebindingProtection: true,
    });

    const res = await app.request('http://localhost:3334/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer knowtis_mcp_test_key',
        Host: 'localhost:3334',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(200);
  });

  it('should not serve protected resource metadata when oauth is null', async () => {
    const app = createApp(makeServer, config);
    const res = await app.request('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(404);
  });

  it('should serve protected resource metadata on the base well-known path', async () => {
    const app = createApp(makeServer, oauthConfig);
    const res = await app.request('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resource: 'https://mcp.knowtis.app/mcp',
      authorization_servers: ['https://api.knowtis.app'],
      scopes_supported: [
        'notes:read',
        'notes:write',
        'notes:share',
        'offline_access',
      ],
      bearer_methods_supported: ['header'],
      resource_name: 'Knowtis MCP',
    });
  });

  it('should serve protected resource metadata on the path-inserted variant', async () => {
    const app = createApp(makeServer, oauthConfig);
    const res = await app.request('/.well-known/oauth-protected-resource/mcp');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resource: 'https://mcp.knowtis.app/mcp',
      authorization_servers: ['https://api.knowtis.app'],
      scopes_supported: [
        'notes:read',
        'notes:write',
        'notes:share',
        'offline_access',
      ],
      bearer_methods_supported: ['header'],
      resource_name: 'Knowtis MCP',
    });
  });

  it('should expose protected resource metadata to browsers via CORS', async () => {
    const app = createApp(makeServer, oauthConfig);
    const res = await app.request('/.well-known/oauth-protected-resource', {
      headers: { Origin: 'https://claude.ai' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should challenge with resource_metadata when oauth is configured', async () => {
    const app = createApp(makeServer, oauthConfig);
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: INITIALIZE,
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://mcp.knowtis.app/.well-known/oauth-protected-resource", scope="notes:read notes:write notes:share offline_access"'
    );
  });

  it('should advertise write and share scopes so clients do not consent read-only', async () => {
    const app = createApp(makeServer, oauthConfig);
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: INITIALIZE,
    });

    const scope = res.headers
      .get('WWW-Authenticate')
      ?.match(/scope="([^"]+)"/)?.[1]
      .split(' ');

    expect(scope).toEqual([
      'notes:read',
      'notes:write',
      'notes:share',
      'offline_access',
    ]);
  });
});
