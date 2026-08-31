import { Inject, Injectable, Logger } from '@nestjs/common';
import { generateText, Output } from 'ai';
import type { ZodType } from 'zod';

import { executeWithChain } from '@knowtis/ai-gateway';
import { pickDefined } from '@knowtis/shared-util';

import type {
  AIStructuredOutputProvider,
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../../domain/ports/ai-structured-output.port';
import { FallbackChainService } from './fallback-chain.service';
import {
  OPENROUTER_ROUTING_SOURCE,
  openrouterProviderOptions,
  type OpenRouterRoutingSource,
} from './openrouter-options';
import { ProviderRegistryFactory } from './provider-registry.factory';
import { buildRedactedTelemetry } from './redacted-telemetry';
import { withTraceIdentity } from './trace-identity';

interface GenerateParams<T> {
  readonly prompt: string;
  readonly schema: ZodType<T>;
  readonly options: StructuredOutputOptions;
  readonly providerOrder: readonly string[];
  readonly timeoutSignal: AbortSignal | undefined;
}

@Injectable()
export class AIStructuredOutputSDKProvider implements AIStructuredOutputProvider {
  private readonly logger = new Logger(AIStructuredOutputSDKProvider.name);

  constructor(
    private readonly providerRegistry: ProviderRegistryFactory,
    private readonly fallbackChain: FallbackChainService,
    @Inject(OPENROUTER_ROUTING_SOURCE)
    private readonly openrouterRouting: OpenRouterRoutingSource
  ) {}

  async generateStructuredOutput<T>(
    prompt: string,
    schema: ZodType<T>,
    options: StructuredOutputOptions
  ): Promise<StructuredOutputResult<T>> {
    const providerOrder =
      await this.openrouterRouting.getOpenRouterProviderOrder();

    return executeWithChain(
      (model) => {
        const timeoutSignal = options.timeoutMs
          ? AbortSignal.timeout(options.timeoutMs)
          : undefined;
        return this.callGenerate({
          prompt,
          schema,
          options: { ...options, model },
          providerOrder,
          timeoutSignal,
        });
      },
      {
        candidates: this.fallbackChain.candidatesFor(
          options.model,
          options.fallbackScope
        ),
        cooldown: this.fallbackChain.cooldown,
        logger: this.logger,
      }
    );
  }

  private async callGenerate<T>({
    prompt,
    schema,
    options,
    providerOrder,
    timeoutSignal,
  }: GenerateParams<T>): Promise<StructuredOutputResult<T>> {
    const result = await withTraceIdentity(options.telemetry, () =>
      generateText({
        model: this.providerRegistry.languageModel(options.model),
        ...(options.instructions ? { instructions: options.instructions } : {}),
        prompt,
        output: Output.object({ schema }),
        maxRetries: options.maxRetries ?? 3,
        ...pickDefined(options, ['maxOutputTokens', 'temperature']),
        ...openrouterProviderOptions({
          model: options.model,
          providerOrder,
          requireParameters: true,
        }),
        ...(timeoutSignal ? { abortSignal: timeoutSignal } : {}),
        ...(options.telemetry
          ? {
              telemetry: buildRedactedTelemetry(
                options.telemetry.functionId,
                options.telemetry.recordContent ?? false
              ),
            }
          : {}),
      })
    );

    return {
      object: result.output as T,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      model: options.model,
    };
  }
}
