import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import type Provider from 'oidc-provider';

import { DATABASE_CONNECTION, type Database } from '../../database';
import { FeatureFlagsService } from '../feature-flags';
import {
  grantBelongsToAccount,
  listGrantsByAccount,
} from './drizzle-oidc.adapter';
import { OAUTH_PROVIDER } from './oauth.tokens';
import { MCP_OAUTH_FLAG } from './oidc-mount.middleware';
import type { OidcProviderHandle } from './oidc-provider.factory';

interface ConnectedGrant {
  grantId: string;
  clientId: string;
  clientName: string | null;
  scopes: string[];
  createdAt: string;
}

function safeHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return '';
  }
}

function addSpaceScopes(value: unknown, into: Set<string>): void {
  if (typeof value !== 'string') {
    return;
  }
  for (const scope of value.split(' ')) {
    if (scope && scope !== 'openid') {
      into.add(scope);
    }
  }
}

function collectScopes(
  source: Record<string, unknown>,
  into: Set<string>
): void {
  const resources = source['resources'];
  if (resources && typeof resources === 'object') {
    for (const value of Object.values(resources as Record<string, unknown>)) {
      addSpaceScopes(value, into);
    }
  }
  const openid = source['openid'];
  if (openid && typeof openid === 'object') {
    addSpaceScopes((openid as Record<string, unknown>)['scope'], into);
  }
}

/**
 * Granted scopes for a Grant payload: everything under `resources`/`openid`
 * minus anything the user rejected (oidc-provider keeps rejections in a
 * mirrored `rejected` sub-object).
 */
function extractGrantScopes(payload: Record<string, unknown>): string[] {
  const granted = new Set<string>();
  collectScopes(payload, granted);
  const rejected = payload['rejected'];
  if (rejected && typeof rejected === 'object') {
    const denied = new Set<string>();
    collectScopes(rejected as Record<string, unknown>, denied);
    for (const scope of denied) {
      granted.delete(scope);
    }
  }
  return [...granted];
}

// Grant payloads carry no created_at column; oidc-provider's opaque format
// always writes `iat` (issued-at, epoch seconds) — the honest creation time.
function grantCreatedAt(iat: unknown): string {
  const seconds = typeof iat === 'number' ? iat : 0;
  return new Date(seconds * 1000).toISOString();
}

@Controller('oauth/grants')
export class OauthGrantsController {
  private readonly logger = new Logger(OauthGrantsController.name);

  constructor(
    @Inject(OAUTH_PROVIDER)
    private readonly handle: OidcProviderHandle | null,
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly featureFlags: FeatureFlagsService
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: RequestUser
  ): Promise<{ grants: ConnectedGrant[] }> {
    const provider = await this.resolveProvider();
    const rows = await listGrantsByAccount(this.db, user.id);

    const grants = await Promise.all(
      rows.map(async (row): Promise<ConnectedGrant> => {
        const payload = row.payload as Record<string, unknown>;
        const clientId =
          typeof payload['clientId'] === 'string'
            ? (payload['clientId'] as string)
            : '';
        return {
          grantId: row.id,
          clientId,
          clientName: await this.resolveClientName(provider, clientId),
          scopes: extractGrantScopes(payload),
          createdAt: grantCreatedAt(payload['iat']),
        };
      })
    );

    return { grants };
  }

  @Delete(':grantId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async revoke(
    @Param('grantId') grantId: string,
    @CurrentUser() user: RequestUser
  ): Promise<void> {
    const provider = await this.resolveProvider();
    if (!(await grantBelongsToAccount(this.db, grantId, user.id))) {
      throw new NotFoundException();
    }

    await Promise.all([
      provider.AccessToken.revokeByGrantId(grantId),
      provider.RefreshToken.revokeByGrantId(grantId),
      provider.AuthorizationCode.revokeByGrantId(grantId),
      provider.Grant.adapter.destroy(grantId),
    ]);

    this.logger.log({
      event: 'oauth.grant.revoked',
      grantId,
      accountId: user.id,
    });
  }

  private async resolveProvider(): Promise<Provider> {
    if (!this.handle) {
      throw new NotFoundException();
    }
    if (!(await this.featureFlags.isEnabled(MCP_OAUTH_FLAG))) {
      throw new NotFoundException();
    }
    return this.handle.provider;
  }

  private async resolveClientName(
    provider: Provider,
    clientId: string
  ): Promise<string | null> {
    // CIMD clients (client_id is a URL) resolve their name from the host —
    // never fetch the metadata document just to render a settings row.
    if (clientId.startsWith('http')) {
      return safeHost(clientId) || null;
    }
    // Isolate the lookup: one client store failure must degrade a single row to
    // a null name, never reject the whole grants list.
    try {
      const client = await provider.Client.find(clientId);
      return client?.clientName ?? null;
    } catch (error) {
      this.logger.warn({
        event: 'oauth.grant.client_lookup_failed',
        clientId,
        error,
      });
      return null;
    }
  }
}
