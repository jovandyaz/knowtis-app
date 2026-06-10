import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';

const WEBHOOK_TIMEOUT_MS = 5000;

@Injectable()
export class WebhookAlertService {
  private readonly logger = new Logger(WebhookAlertService.name);
  private readonly url: string | undefined;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.url = configService.get('AI_ALERT_WEBHOOK_URL') || undefined;
  }

  /** Fire-and-forget JSON POST to the configured webhook; never throws and never blocks the caller. */
  notify(event: string, payload: Record<string, unknown>): void {
    if (!this.url) {
      return;
    }
    void fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        ...payload,
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
      .then((response) => {
        if (!response.ok) {
          this.logger.warn({
            event: 'ai.alert.webhook_failed',
            alert: event,
            status: response.status,
          });
        }
      })
      .catch((error: unknown) => {
        this.logger.warn({
          event: 'ai.alert.webhook_failed',
          alert: event,
          error: error instanceof Error ? error.message : 'unknown error',
        });
      });
  }
}
