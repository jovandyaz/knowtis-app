import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type Provider from 'oidc-provider';
import type { Interaction, InteractionResults } from 'oidc-provider';

import { DATABASE_CONNECTION, type Database } from '../../database';
import { FeatureFlagsService } from '../feature-flags';
import { findGrantIdsByAccountAndClient } from './drizzle-oidc.adapter';
import { ConsentDecisionDto } from './dto/consent-decision.dto';
import {
  OAUTH_PROVIDER,
  OAUTH_RUNTIME,
  type OauthRuntime,
} from './oauth.tokens';
import { MCP_OAUTH_FLAG } from './oidc-mount.middleware';
import type { OidcProviderHandle } from './oidc-provider.factory';

interface InteractionDescription {
  clientId: string;
  clientName: string | null;
  redirectHost: string;
  scopes: string[];
  isCimdClient: boolean;
}

function stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === 'string' ? value : '';
}

function parseScopes(scope: string): string[] {
  return scope.split(' ').filter(Boolean);
}

function safeHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return '';
  }
}

/**
 * JSON bridge between the Knowtis-hosted consent page and the oidc-provider
 * interaction session. These endpoints live under the API global prefix
 * (/api/v1/oauth/interactions), NOT the raw oidc mount, so they cannot rely on
 * provider.interactionDetails/interactionFinished: those read the path-scoped
 * `interaction` cookie (set at authorize time for the /oauth/consent path on
 * the AS origin), which the browser never sends to /api/v1 paths. Instead the
 * interaction is resolved directly by its uid (the capability), and completion
 * persists interaction.result + returns interaction.returnTo — the resume
 * navigation carries its own path-scoped `resume` cookie set by the provider.
 */
@Controller('oauth/interactions')
export class OauthInteractionController {
  private readonly logger = new Logger(OauthInteractionController.name);

  constructor(
    @Inject(OAUTH_PROVIDER)
    private readonly handle: OidcProviderHandle | null,
    @Inject(OAUTH_RUNTIME)
    private readonly runtime: OauthRuntime | null,
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly featureFlags: FeatureFlagsService
  ) {}

  @Get(':uid')
  async describe(@Param('uid') uid: string): Promise<InteractionDescription> {
    const provider = await this.resolveProvider();
    const interaction = await this.findInteraction(provider, uid);

    const { params } = interaction;
    const clientId = stringParam(params, 'client_id');
    const client = await provider.Client.find(clientId);

    return {
      clientId,
      clientName: client?.clientName ?? null,
      redirectHost: safeHost(stringParam(params, 'redirect_uri')),
      scopes: parseScopes(stringParam(params, 'scope')),
      isCimdClient: clientId.startsWith('http'),
    };
  }

  @Post(':uid/confirm')
  @UseGuards(JwtAuthGuard)
  async confirm(
    @Param('uid') uid: string,
    @Body() decision: ConsentDecisionDto,
    @CurrentUser() user: RequestUser
  ): Promise<{ returnTo: string }> {
    const provider = await this.resolveProvider();
    const resourceUrl = this.resolveResourceUrl();
    const interaction = await this.findInteraction(provider, uid);

    const { params } = interaction;
    const clientId = stringParam(params, 'client_id');
    const requestedScopes = parseScopes(stringParam(params, 'scope'));

    await this.revokePriorGrants(
      provider,
      user.id,
      clientId,
      interaction.grantId
    );

    const approved = new Set(decision.approvedScopes);
    const requestedNotes = requestedScopes.filter((scope) =>
      scope.startsWith('notes:')
    );
    const grantedNotes = requestedNotes.filter((scope) => approved.has(scope));
    const deniedNotes = requestedNotes.filter((scope) => !approved.has(scope));

    const grant = new provider.Grant({ accountId: user.id, clientId });
    if (grantedNotes.length > 0) {
      grant.addResourceScope(resourceUrl, grantedNotes.join(' '));
    }
    // Requested scopes left undecided make the provider re-prompt for consent
    // (missing-scope check), so denied scopes must be explicitly rejected.
    if (deniedNotes.length > 0) {
      grant.rejectResourceScope(resourceUrl, deniedNotes.join(' '));
    }
    if (requestedScopes.includes('offline_access')) {
      if (approved.has('offline_access')) {
        grant.addOIDCScope('offline_access');
      } else {
        grant.rejectOIDCScope('offline_access');
      }
    }
    const grantId = await grant.save();
    this.logger.log({
      event: 'oauth.grant.created',
      clientId,
      accountId: user.id,
      grantId,
    });

    // login is always submitted: resume is a no-op on a matching OP session
    // and rebinds a stale/expired one instead of failing the flow.
    return this.finish(
      interaction,
      { login: { accountId: user.id }, consent: { grantId } },
      true
    );
  }

  @Post(':uid/abort')
  async abort(@Param('uid') uid: string): Promise<{ returnTo: string }> {
    const provider = await this.resolveProvider();
    const interaction = await this.findInteraction(provider, uid);

    this.logger.log({
      event: 'oauth.consent.denied',
      clientId: stringParam(interaction.params, 'client_id'),
    });

    return this.finish(
      interaction,
      {
        error: 'access_denied',
        error_description: 'End-user aborted the authorization request',
      },
      false
    );
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

  private resolveResourceUrl(): string {
    if (!this.runtime) {
      throw new NotFoundException();
    }
    return this.runtime.resourceUrl;
  }

  private async findInteraction(
    provider: Provider,
    uid: string
  ): Promise<Interaction> {
    const interaction = await provider.Interaction.find(uid);
    if (!interaction) {
      throw new NotFoundException('interaction not found');
    }
    // A fresh or resumed interaction carries prior rounds in lastSubmission,
    // never in result — a set result means this uid was already decided.
    if (interaction.result) {
      throw new ConflictException('interaction already resolved');
    }
    return interaction;
  }

  private async finish(
    interaction: Interaction,
    result: InteractionResults,
    merge: boolean
  ): Promise<{ returnTo: string }> {
    interaction.result =
      merge && !('error' in result)
        ? { ...interaction.lastSubmission, ...result }
        : result;
    await interaction.persist();
    return { returnTo: interaction.returnTo };
  }

  /**
   * Revokes every prior grant for the account+client pair before a new one is
   * saved. interaction.grantId only exists when the OP session already had a
   * grant — absent on the login-bridge path — so prior grants are also looked
   * up by accountId+clientId in the adapter store.
   */
  private async revokePriorGrants(
    provider: Provider,
    accountId: string,
    clientId: string,
    sessionGrantId: string | undefined
  ): Promise<void> {
    const grantIds = new Set(
      await findGrantIdsByAccountAndClient(this.db, accountId, clientId)
    );
    if (sessionGrantId) {
      grantIds.add(sessionGrantId);
    }
    if (grantIds.size === 0) {
      return;
    }
    await Promise.all(
      [...grantIds].map((id) => this.revokeGrant(provider, id))
    );
    this.logger.log({
      event: 'oauth.grants.revoked',
      clientId,
      accountId,
      grantIds: [...grantIds],
    });
  }

  private async revokeGrant(
    provider: Provider,
    grantId: string
  ): Promise<void> {
    await Promise.all([
      provider.AccessToken.revokeByGrantId(grantId),
      provider.RefreshToken.revokeByGrantId(grantId),
      provider.AuthorizationCode.revokeByGrantId(grantId),
      provider.Grant.adapter.destroy(grantId),
    ]);
  }
}
