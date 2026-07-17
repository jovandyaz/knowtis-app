import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Param,
  Put,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { generateText } from 'ai';

import { providerOf } from '@knowtis/ai-gateway';
import type { AIProvider, SystemProviderInfo } from '@knowtis/shared-types';

import { Roles, RolesGuard } from '../authorization/roles.guard';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { SystemProviderKeysService } from './application/services/system-provider-keys.service';
import { CURATED_MODELS } from './domain/model-catalog/selectable-models.catalog';
import { SetSystemProviderDto } from './dto/set-system-provider.dto';
import { SystemProviderParamDto } from './dto/system-provider-param.dto';
import { UserScopedThrottlerGuard } from './guards/user-scoped-throttler.guard';
import { ProviderRegistryFactory } from './infrastructure/providers/provider-registry.factory';

const PROBE_MAX_OUTPUT_TOKENS = 16;

@UseGuards(JwtAuthGuard, FeatureFlagGuard, RolesGuard)
@RequireFeatureFlag('ai_enabled')
@Roles('admin')
@Controller('ai/providers')
export class AiProvidersController {
  private readonly logger = new Logger(AiProvidersController.name);

  constructor(
    private readonly systemKeys: SystemProviderKeysService,
    private readonly registry: ProviderRegistryFactory
  ) {}

  @Get()
  list(): Promise<SystemProviderInfo[]> {
    return this.systemKeys.list();
  }

  @Put(':provider')
  @UseGuards(UserScopedThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async set(
    @CurrentUser() user: RequestUser,
    @Param() params: SystemProviderParamDto,
    @Body() dto: SetSystemProviderDto
  ): Promise<SystemProviderInfo[]> {
    if (dto.apiKey === undefined && dto.enabled === undefined) {
      throw new BadRequestException('Provide apiKey, enabled, or both');
    }
    if (dto.apiKey !== undefined) {
      await this.probeKey(params.provider, dto.apiKey);
      await this.systemKeys.setKey(params.provider, dto.apiKey, user.id);
    }
    if (dto.enabled !== undefined) {
      await this.systemKeys.setEnabled(params.provider, dto.enabled, user.id);
    }
    return this.applied();
  }

  @Delete(':provider/key')
  @UseGuards(UserScopedThrottlerGuard)
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

  /** A stored key shadows the env value, so a rejected key must never be persisted. */
  private async probeKey(provider: AIProvider, apiKey: string): Promise<void> {
    const candidates = CURATED_MODELS.filter(
      (m) => providerOf(m.id) === provider
    );
    const probe = candidates.find((m) => m.tier === 'fast') ?? candidates[0];
    if (!probe) {
      throw new UnprocessableEntityException(
        `No curated model found for provider '${provider}'`
      );
    }
    try {
      await generateText({
        model: this.registry.languageModel(probe.id, apiKey),
        prompt: 'ping',
        maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn({
        event: 'system_provider_key.probe_failed',
        provider,
        model: probe.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
      // Only the provider rejecting the credential proves the key is bad; an
      // outage must not block an emergency rotation.
      const status = (error as { statusCode?: number }).statusCode;
      if (status !== undefined && status !== 401 && status !== 403) {
        throw new ServiceUnavailableException(
          `Could not verify the ${provider} key — ${provider} returned ${status}. Retry shortly.`
        );
      }
      throw new UnprocessableEntityException(
        `The ${provider} key was rejected. Check it is valid and has quota.`
      );
    }
  }
}
