import type { IncomingMessage, ServerResponse } from 'node:http';

import { eq } from 'drizzle-orm';
import Provider from 'oidc-provider';
import type { Configuration, JWKS } from 'oidc-provider';

import { users, type Database } from '../../database';
import { MCP_SCOPES, TOKEN_SOURCE_MCP } from '../mcp/mcp-token';
import { createAdapterFactory } from './drizzle-oidc.adapter';

const DAY_SECONDS = 24 * 60 * 60;
const REFRESH_TTL_URL_CLIENT = 30 * DAY_SECONDS;
const REFRESH_TTL_LOCAL_CLIENT = 90 * DAY_SECONDS;

/**
 * URL client_ids are remote MCP clients (CIMD) and get a shorter 30d refresh
 * window; locally registered (opaque) client_ids get 90d.
 */
export function refreshTokenTtl(client: { clientId: string }): number {
  return client.clientId.startsWith('http')
    ? REFRESH_TTL_URL_CLIENT
    : REFRESH_TTL_LOCAL_CLIENT;
}

/**
 * A refresh token is issued when the client may use the refresh_token grant AND
 * either the authorization code carries `offline_access`, or the client is a
 * public web client (code flow, no client authentication) that did not have
 * `offline_access` explicitly rejected on its grant. oidc-provider strips
 * `offline_access` from any request whose `prompt` omits `consent` (OIDC Core
 * §11, enforced in lib/actions/authorization/check_scope.js), and MCP clients
 * cannot add `prompt=consent` — so the public-client branch keeps their
 * connections alive past the 1h access-token expiry. Mirrors oidc-provider's
 * documented `issueRefreshToken` "always issue" recipe, gated so an explicit
 * denial recorded on the Grant is still honored.
 */
export function shouldIssueRefreshToken(
  client: {
    grantTypeAllowed: (type: string) => boolean;
    applicationType?: string | undefined;
    clientAuthMethod?: string | undefined;
  },
  code: { scopes: Set<string> },
  offlineAccessRejected: boolean
): boolean {
  if (!client.grantTypeAllowed('refresh_token')) {
    return false;
  }
  if (code.scopes.has('offline_access')) {
    return true;
  }
  const isPublicWebClient =
    client.applicationType === 'web' && client.clientAuthMethod === 'none';
  return isPublicWebClient && !offlineAccessRejected;
}

/**
 * True when `offline_access` was explicitly rejected on the grant — the consent
 * bridge records a subset approval as `grant.rejected.openid.scope`, and that
 * denial must veto the public-web default-issue policy. Absent when
 * `offline_access` was simply never requested (stripped per OIDC Core §11).
 */
export function hasRejectedOfflineAccess(
  grant:
    | {
        rejected?:
          | { openid?: { scope?: string | undefined } | undefined }
          | undefined;
      }
    | undefined
): boolean {
  const rejectedScope = grant?.rejected?.openid?.scope ?? '';
  return rejectedScope.split(' ').includes('offline_access');
}

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
    // deps.jwks is Zod-validated at the config boundary; the lib wants its nominal JWK[] type.
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
    ttl: {
      AccessToken: 3600,
      AuthorizationCode: 600,
      Grant: 30 * DAY_SECONDS,
      Interaction: 3600,
      Session: 14 * DAY_SECONDS,
      RefreshToken: (_ctx, _token, client) => refreshTokenTtl(client),
    },
    rotateRefreshToken: true,
    issueRefreshToken: async (ctx, client, code) => {
      const grant =
        typeof code.grantId === 'string'
          ? await ctx.oidc.provider.Grant.find(code.grantId)
          : undefined;
      return shouldIssueRefreshToken(
        client,
        code,
        hasRejectedOfflineAccess(grant)
      );
    },
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
