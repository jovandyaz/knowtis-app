import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  FEATURE_FLAG_KEYS,
  type ProviderKeyProbeResult,
  type ProviderTestResult,
  type SetSystemProviderResult,
  type SystemProviderInfo,
} from '@knowtis/shared-types';

import { Roles, RolesGuard } from '../authorization/roles.guard';
import {
  FeatureFlagGuard,
  RequireFeatureFlag,
} from '../feature-flags/feature-flag.guard';
import { SystemProviderKeysService } from './application/services/system-provider-keys.service';
import {
  PROVIDER_LISTING_KIND,
  PROVIDER_MODELS_LISTER,
  type ProviderModelsLister,
} from './domain/ports/provider-models.port';
import { SetSystemProviderDto } from './dto/set-system-provider.dto';
import { SystemProviderParamDto } from './dto/system-provider-param.dto';
import { ProviderRegistryFactory } from './infrastructure/providers/provider-registry.factory';

@UseGuards(JwtAuthGuard, FeatureFlagGuard, RolesGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
@Roles('admin')
@Controller('ai/providers')
export class AiProvidersController {
  private readonly logger = new Logger(AiProvidersController.name);

  constructor(
    private readonly systemKeys: SystemProviderKeysService,
    private readonly registry: ProviderRegistryFactory,
    @Inject(PROVIDER_MODELS_LISTER)
    private readonly lister: ProviderModelsLister
  ) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  list(): Promise<SystemProviderInfo[]> {
    return this.systemKeys.list();
  }

  /**
   * A candidate key's models are listed before it is stored. A refusal
   * surfaces as 422 and stores nothing; a provider that cannot be reached keeps
   * the key and rides along as `probe` — the admin may be keying a provider
   * that is briefly down.
   */
  @Put(':provider')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async set(
    @CurrentUser() user: RequestUser,
    @Param() params: SystemProviderParamDto,
    @Body() dto: SetSystemProviderDto
  ): Promise<SetSystemProviderResult> {
    if (dto.apiKey === undefined && dto.enabled === undefined) {
      throw new BadRequestException('Provide apiKey, enabled, or both');
    }
    let probe: ProviderKeyProbeResult | undefined;
    if (dto.apiKey !== undefined) {
      probe = await this.systemKeys.setKey(
        params.provider,
        dto.apiKey,
        user.id
      );
    }
    if (dto.enabled !== undefined) {
      await this.systemKeys.setEnabled(params.provider, dto.enabled, user.id);
    }
    return { providers: await this.applied(), ...(probe ? { probe } : {}) };
  }

  /**
   * Lists the models of whatever key currently routes the provider directly. A
   * refusal is the answer the caller asked for, so it resolves 200 with
   * `ok: false` — the global filter masks 5xx bodies, which would throw the
   * diagnosis away.
   */
  @Post(':provider/test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async test(
    @Param() params: SystemProviderParamDto
  ): Promise<ProviderTestResult> {
    const { provider } = params;
    const apiKey = this.registry.routingKey(provider);
    if (apiKey === null) {
      return {
        ok: false,
        reason: 'unconfigured',
        message: `No ${provider} key routes directly: store one or enable the provider`,
      };
    }
    const listing = await this.lister.list(provider, apiKey);
    if (listing.kind === PROVIDER_LISTING_KIND.LISTED) {
      return { ok: true, modelCount: listing.modelIds?.length ?? null };
    }
    this.logger.warn({
      event: 'system_provider_key.test_failed',
      provider,
      reason: listing.kind,
      error: listing.error,
    });
    return listing.kind === PROVIDER_LISTING_KIND.REJECTED
      ? {
          ok: false,
          reason: 'rejected',
          message: `${provider} refused the key: ${listing.error}`,
        }
      : {
          ok: false,
          reason: 'unavailable',
          message: `${provider} is unavailable right now. Retry shortly.`,
        };
  }

  @Delete(':provider/key')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async clearKey(
    @CurrentUser() user: RequestUser,
    @Param() params: SystemProviderParamDto
  ): Promise<SystemProviderInfo[]> {
    await this.systemKeys.clearKey(params.provider, user.id);
    return this.applied();
  }

  /** Routing caches the config for a TTL; refresh so the response reflects what is actually serving. */
  private async applied(): Promise<SystemProviderInfo[]> {
    await this.registry.refreshSystemConfigs();
    return this.systemKeys.list();
  }
}
