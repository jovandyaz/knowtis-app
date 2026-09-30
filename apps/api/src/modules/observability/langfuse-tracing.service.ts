import { LangfuseSpanProcessor } from '@langfuse/otel';
import { LangfuseVercelAiSdkIntegration } from '@langfuse/vercel-ai-sdk';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { registerTelemetry } from 'ai';

import type { EnvConfig } from '../../config/env.config';
import { reasonOf } from '../../core/errors/reason-of';

/** How long shutdown waits for pending spans to export before it drops them. */
export const LANGFUSE_SHUTDOWN_TIMEOUT_MS = 1_000;

@Injectable()
export class LangfuseTracingService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(LangfuseTracingService.name);
  private sdk: NodeSDK | undefined;
  private spanProcessor: LangfuseSpanProcessor | undefined;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  // Registers the global tracer provider here, not pre-bootstrap: ConfigModule
  // loads apps/api/.env during Nest init, so keys are only readable post-init.
  // AI SDK telemetry resolves the tracer at call time (request), well after this.
  onApplicationBootstrap(): void {
    const publicKey = this.configService.get('LANGFUSE_PUBLIC_KEY');
    const secretKey = this.configService.get('LANGFUSE_SECRET_KEY');
    if (!publicKey || !secretKey) {
      this.logger.log('Langfuse tracing disabled (keys not configured)');
      return;
    }
    try {
      this.spanProcessor = new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl: this.configService.get('LANGFUSE_BASE_URL'),
        environment: this.configService.get('NODE_ENV'),
      });
      this.sdk = new NodeSDK({ spanProcessors: [this.spanProcessor] });
      this.sdk.start();
      // AI SDK 7 emits no telemetry at all until an integration is registered.
      registerTelemetry(new LangfuseVercelAiSdkIntegration());
      this.logger.log('Langfuse tracing enabled');
    } catch (error) {
      this.logger.warn(`Langfuse initialization failed: ${reasonOf(error)}`);
      this.sdk = undefined;
      this.spanProcessor = undefined;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const sdk = this.sdk;
    if (!sdk) {
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<'timed_out'>((resolve) => {
      timer = setTimeout(
        () => resolve('timed_out'),
        LANGFUSE_SHUTDOWN_TIMEOUT_MS
      );
      timer.unref();
    });
    try {
      const outcome = await Promise.race([this.flushAndStop(sdk), deadline]);
      if (outcome === 'timed_out') {
        this.logger.warn({
          event: 'langfuse.shutdown.timed_out',
          timeoutMs: LANGFUSE_SHUTDOWN_TIMEOUT_MS,
        });
      }
    } catch (error) {
      this.logger.warn(`Langfuse shutdown failed: ${reasonOf(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async flushAndStop(sdk: NodeSDK): Promise<'stopped'> {
    await this.spanProcessor?.forceFlush();
    await sdk.shutdown();
    return 'stopped';
  }
}
