import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type Provider from 'oidc-provider';
import type { Interaction, InteractionResults } from 'oidc-provider';

import { FeatureFlagsService } from '../feature-flags';
import { ConsentDecisionDto } from './dto/consent-decision.dto';
import {
  OAUTH_PROVIDER,
  OAUTH_RUNTIME,
  type OauthRuntime,
} from './oauth.module';
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
  constructor(
    @Inject(OAUTH_PROVIDER)
    private readonly handle: OidcProviderHandle | null,
    @Inject(OAUTH_RUNTIME)
    private readonly runtime: OauthRuntime | null,
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

    if (interaction.grantId) {
      await this.revokePriorGrant(provider, interaction.grantId);
    }

    const grant = new provider.Grant({ accountId: user.id, clientId });
    const resourceScopes = decision.approvedScopes.filter(
      (scope) => scope.startsWith('notes:') && requestedScopes.includes(scope)
    );
    if (resourceScopes.length > 0) {
      grant.addResourceScope(resourceUrl, resourceScopes.join(' '));
    }
    if (
      requestedScopes.includes('offline_access') &&
      decision.approvedScopes.includes('offline_access')
    ) {
      grant.addOIDCScope('offline_access');
    }
    const grantId = await grant.save();

    const result: InteractionResults = { consent: { grantId } };
    if (interaction.session?.accountId !== user.id) {
      result.login = { accountId: user.id };
    }

    return this.finish(interaction, result, true);
  }

  @Post(':uid/abort')
  async abort(@Param('uid') uid: string): Promise<{ returnTo: string }> {
    const provider = await this.resolveProvider();
    const interaction = await this.findInteraction(provider, uid);

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

  private async revokePriorGrant(
    provider: Provider,
    grantId: string
  ): Promise<void> {
    await Promise.all([
      provider.AccessToken.revokeByGrantId(grantId),
      provider.RefreshToken.revokeByGrantId(grantId),
      provider.AuthorizationCode.revokeByGrantId(grantId),
    ]);
    const grant = await provider.Grant.find(grantId);
    await grant?.destroy();
  }
}
