import type { IncomingMessage, ServerResponse } from 'node:http';

import { eq } from 'drizzle-orm';
import Provider from 'oidc-provider';
import type { Configuration, JWKS } from 'oidc-provider';

import { users, type Database } from '../../database';
import { MCP_SCOPES, TOKEN_SOURCE_MCP } from '../mcp/mcp-token';
import { createAdapterFactory } from './drizzle-oidc.adapter';

const DAY_SECONDS = 24 * 60 * 60;

// @types/oidc-provider lags the runtime and lacks the experimental clientIdMetadataDocument feature.
type OidcConfiguration = Omit<Configuration, 'features'> & {
  features: NonNullable<Configuration['features']> & {
    clientIdMetadataDocument: { enabled: boolean; ack: string };
  };
};

export interface OidcProviderDeps {
  db: Database;
  issuer: string;
  jwks: { keys: Record<string, unknown>[] };
  cookieKeys: string[];
  resourceUrl: string;
  frontendUrl: string;
}

export interface OidcProviderHandle {
  provider: Provider;
  callback: (req: IncomingMessage, res: ServerResponse) => void;
}

async function findUser(
  db: Database,
  id: string
): Promise<{ id: string; email: string } | undefined> {
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user;
}

export async function createOidcProvider(
  deps: OidcProviderDeps
): Promise<OidcProviderHandle> {
  const { db, issuer, jwks, cookieKeys, resourceUrl, frontendUrl } = deps;

  const configuration: OidcConfiguration = {
    adapter: createAdapterFactory(db),
    jwks: jwks as JWKS,
    cookies: { keys: cookieKeys },
    clients: [],
    scopes: [
      MCP_SCOPES.READ,
      MCP_SCOPES.WRITE,
      MCP_SCOPES.SHARE,
      'offline_access',
    ],
    responseTypes: ['code'],
    pkce: { required: () => true },
    clientDefaults: {
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      id_token_signed_response_alg: 'ES256',
    },
    clientBasedCORS: () => true,
    ttl: {
      AccessToken: 3600,
      AuthorizationCode: 600,
      Grant: 30 * DAY_SECONDS,
      Interaction: 3600,
      Session: 14 * DAY_SECONDS,
      RefreshToken: (_ctx, _token, client) =>
        client.clientId.startsWith('http')
          ? 30 * DAY_SECONDS
          : 90 * DAY_SECONDS,
    },
    rotateRefreshToken: true,
    issueRefreshToken: (_ctx, client, code) =>
      client.grantTypeAllowed('refresh_token') &&
      code.scopes.has('offline_access'),
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: true, initialAccessToken: false },
      revocation: { enabled: true },
      clientIdMetadataDocument: { enabled: true, ack: 'draft-01' },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => resourceUrl,
        useGrantedResource: () => true,
        getResourceServerInfo: () => ({
          scope: `${MCP_SCOPES.READ} ${MCP_SCOPES.WRITE} ${MCP_SCOPES.SHARE}`,
          audience: resourceUrl,
          accessTokenTTL: 3600,
          accessTokenFormat: 'jwt',
          jwt: { sign: { alg: 'ES256' } },
        }),
      },
    },
    extraTokenClaims: async (_ctx, token) => {
      if (token.kind !== 'AccessToken') {
        return undefined;
      }
      const user = await findUser(db, token.accountId);
      return {
        email: user?.email,
        source: TOKEN_SOURCE_MCP,
        scopes: [...token.scopes]
          .filter((scope) => scope.startsWith('notes:'))
          .join(','),
      };
    },
    findAccount: async (_ctx, id) => {
      const user = await findUser(db, id);
      if (!user) {
        return undefined;
      }
      return { accountId: id, claims: () => ({ sub: id, email: user.email }) };
    },
    interactions: {
      url: (_ctx, interaction) =>
        `${frontendUrl}/oauth/consent?uid=${interaction.uid}`,
    },
    loadExistingGrant: async (ctx) => {
      const clientId = ctx.oidc.client?.clientId;
      const grantId =
        ctx.oidc.result?.['consent']?.['grantId'] ??
        (clientId ? ctx.oidc.session?.grantIdFor(clientId) : undefined);
      return typeof grantId === 'string'
        ? ctx.oidc.provider.Grant.find(grantId)
        : undefined;
    },
  };

  const provider = new Provider(issuer, configuration);
  provider.proxy = true;
  return { provider, callback: provider.callback() };
}
