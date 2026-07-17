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
  Logger,
  Param,
  Post,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { APICallError, generateText } from 'ai';

import { providerOf } from '@knowtis/ai-gateway';
import type {
  AIProvider,
  ProviderTestResult,
  SystemProviderInfo,
} from '@knowtis/shared-types';

import { Roles, RolesGuard } from '../authorization/roles.guard';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { SystemProviderKeysService } from './application/services/system-provider-keys.service';
import { CURATED_MODELS } from './domain/model-catalog/selectable-models.catalog';
import { SetSystemProviderDto } from './dto/set-system-provider.dto';
import { SystemProviderParamDto } from './dto/system-provider-param.dto';
import { UserScopedThrottlerGuard } from './guards/user-scoped-throttler.guard';
import {
  ProviderNotConfiguredError,
  ProviderRegistryFactory,
} from './infrastructure/providers/provider-registry.factory';

const PROBE_MAX_OUTPUT_TOKENS = 16;
const PROBE_TIMEOUT_MS = 10_000;
// Below this a "key" is too short to match anything but itself in prose.
const REDACTABLE_KEY_MIN_LENGTH = 8;

@UseGuards(JwtAuthGuard, FeatureFlagGuard, RolesGuard, UserScopedThrottlerGuard)
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
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  list(): Promise<SystemProviderInfo[]> {
    return this.systemKeys.list();
  }

  @Put(':provider')
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
      const probe = await this.probe(params.provider, dto.apiKey);
      if (!probe.ok) {
        // 422 for every outcome, with `reason` carrying the distinction: a 503
        // would be truer for an outage but the global filter masks 5xx bodies,
        // so the admin would read 'Internal server error' instead of the cause.
        throw new UnprocessableEntityException({
          message: probe.message,
          code: probe.reason,
        });
      }
      await this.systemKeys.setKey(params.provider, dto.apiKey, user.id);
    }
    if (dto.enabled !== undefined) {
      await this.systemKeys.setEnabled(params.provider, dto.enabled, user.id);
    }
    return this.applied();
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

  /**
   * Sends one cheap turn through the provider. Omit `apiKey` to probe the key
   * that currently routes; pass a candidate to vet it before storing, since a
   * stored key shadows the env one.
   */
  private async probe(
    provider: AIProvider,
    apiKey?: string
  ): Promise<ProviderTestResult> {
    const candidates = CURATED_MODELS.filter(
      (m) => providerOf(m.id) === provider
    );
    const model = candidates.find((m) => m.tier === 'fast') ?? candidates[0];
    if (!model) {
      return {
        ok: false,
        reason: 'unconfigured',
        message: `No curated model found for provider '${provider}'`,
      };
    }
    try {
      await generateText({
        model: this.registry.languageModel(model.id, apiKey),
        prompt: 'ping',
        maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return { ok: true, model: model.id };
    } catch (error) {
      const secrets = apiKey
        ? [apiKey]
        : this.registry.routingSecrets(provider);
      return this.classifyProbeFailure(provider, model.id, error, secrets);
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
    const detail = redact(
      error instanceof Error ? error.message : 'unknown',
      secrets
    );
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
