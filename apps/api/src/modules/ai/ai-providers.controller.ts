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
import { APICallError } from 'ai';

import {
  FEATURE_FLAG_KEYS,
  type AIProvider,
  type ProviderKeyProbeResult,
  type ProviderTestResult,
  type SetSystemProviderResult,
  type SystemProviderInfo,
} from '@knowtis/shared-types';

import { reasonOf } from '../../core/errors/reason-of';
import { Roles, RolesGuard } from '../authorization/roles.guard';
import {
  FeatureFlagGuard,
  RequireFeatureFlag,
} from '../feature-flags/feature-flag.guard';
import { SystemProviderKeysService } from './application/services/system-provider-keys.service';
import {
  probablePlatformModelIds,
  systemProbeModelId,
} from './domain/model-catalog/probe-model';
import {
  PLATFORM_MODELS_SOURCE,
  type PlatformModelsSource,
} from './domain/ports/platform-models.port';
import { SetSystemProviderDto } from './dto/set-system-provider.dto';
import { SystemProviderParamDto } from './dto/system-provider-param.dto';
import { ModelIndexCache } from './infrastructure/catalog/model-index.cache';
import {
  PROBE_TIMEOUT_MS,
  sendProbeTurn,
} from './infrastructure/providers/provider-probe';
import {
  ProviderNotConfiguredError,
  ProviderRegistryFactory,
} from './infrastructure/providers/provider-registry.factory';

// Below this a "key" is too short to match anything but itself in prose.
const REDACTABLE_KEY_MIN_LENGTH = 8;

@UseGuards(JwtAuthGuard, FeatureFlagGuard, RolesGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
@Roles('admin')
@Controller('ai/providers')
export class AiProvidersController {
  private readonly logger = new Logger(AiProvidersController.name);

  constructor(
    private readonly systemKeys: SystemProviderKeysService,
    private readonly registry: ProviderRegistryFactory,
    private readonly index: ModelIndexCache,
    @Inject(PLATFORM_MODELS_SOURCE)
    private readonly platformModels: PlatformModelsSource
  ) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  list(): Promise<SystemProviderInfo[]> {
    return this.systemKeys.list();
  }

  /**
   * A candidate key is probed before it is stored. A definitive refusal
   * surfaces as 422 and stores nothing; an outage or timeout keeps the key and
   * rides along as `probe` — the admin may be keying a provider that is
   * briefly down.
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
   * Probes whatever key currently routes for the provider. A refusal is the
   * answer the caller asked for, so it resolves 200 with `ok: false` — the
   * global filter masks 5xx bodies, which would throw the diagnosis away.
   */
  @Post(':provider/test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  test(@Param() params: SystemProviderParamDto): Promise<ProviderTestResult> {
    return this.probe(params.provider);
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

  /** Sends one cheap turn through whatever key currently routes for the provider. */
  private async probe(provider: AIProvider): Promise<ProviderTestResult> {
    const modelId = systemProbeModelId(
      provider,
      await probablePlatformModelIds(this.platformModels),
      this.index.catalog().all()
    );
    if (modelId === null) {
      return {
        ok: false,
        reason: 'unconfigured',
        message: `No model resolves for provider '${provider}'`,
      };
    }
    let secrets: string[] = [];
    try {
      const languageModel = this.registry.languageModel(modelId);
      // Snapshot before the await: an admin rotating the key mid-probe would
      // otherwise leave the error quoting a secret no longer here to scrub.
      secrets = this.registry.routingSecrets(provider);
      await sendProbeTurn(languageModel, AbortSignal.timeout(PROBE_TIMEOUT_MS));
      return { ok: true, model: modelId };
    } catch (error) {
      return this.classifyProbeFailure(provider, modelId, error, secrets);
    }
  }

  private classifyProbeFailure(
    provider: AIProvider,
    model: string,
    error: unknown,
    secrets: string[]
  ): ProviderTestResult {
    if (error instanceof ProviderNotConfiguredError) {
      return { ok: false, reason: 'unconfigured', message: error.message };
    }
    // The SDK already classifies which statuses deserve a retry and exhausts
    // them before rethrowing, so a non-retryable APICallError is the only shape
    // that proves the provider answered and refused.
    const refused = APICallError.isInstance(error) && !error.isRetryable;
    const detail = redact(reasonOf(error), secrets);
    this.logger.warn({
      event: 'system_provider_key.probe_failed',
      provider,
      model,
      reason: refused ? 'rejected' : 'unavailable',
      error: detail,
    });
    return refused
      ? {
          ok: false,
          reason: 'rejected',
          message: `${provider} refused the probe: ${detail}`,
        }
      : {
          ok: false,
          reason: 'unavailable',
          message: `${provider} is unavailable right now. Retry shortly.`,
        };
  }
}

/** Providers echo a rejected credential back in their error text; it must not reach a log or a response. */
function redact(message: string, secrets: string[]): string {
  return secrets.reduce(
    (text, secret) =>
      secret.length < REDACTABLE_KEY_MIN_LENGTH
        ? text
        : text.split(secret).join('[redacted]'),
    message
  );
}
