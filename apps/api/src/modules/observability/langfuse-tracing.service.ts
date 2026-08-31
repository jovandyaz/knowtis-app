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
      this.logger.warn(
        `Langfuse initialization failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
      this.sdk = undefined;
      this.spanProcessor = undefined;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.sdk) {
      return;
    }
    try {
      await this.spanProcessor?.forceFlush();
      await this.sdk.shutdown();
    } catch (error) {
      this.logger.warn(
        `Langfuse shutdown failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  }
}
