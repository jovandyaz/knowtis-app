import { Inject, Injectable, Logger } from '@nestjs/common';

import { NOTIFYING_ALERT_KINDS } from '@knowtis/shared-types';

import { reasonOf } from '../../../../core/errors/reason-of';
import type { WatchFinding } from '../../domain/model-catalog/model-watch';
import {
  AI_CATALOG_REPOSITORY,
  type AiCatalogRepository,
} from '../../domain/ports/ai-catalog.repository';
import { WebhookAlertService } from '../alerting/webhook-alert.service';

const CATALOG_ALERT_EVENT = 'ai.catalog.alert';

/** What one `raise` did: the alerts it newly opened, and the writes that failed. */
export interface RaisedAlerts {
  readonly opened: number;
  readonly failed: number;
}

/** Turns watch findings into catalog alerts, and pings the ops webhook once per newly opened urgent one. */
@Injectable()
export class CatalogAlertsWriter {
  private readonly logger = new Logger(CatalogAlertsWriter.name);

  constructor(
    @Inject(AI_CATALOG_REPOSITORY) private readonly repo: AiCatalogRepository,
    private readonly webhook: WebhookAlertService
  ) {}

  /**
   * Opens an alert per finding unless one is already open for its subject and
   * kind. Only a newly opened alert of a `NOTIFYING_ALERT_KINDS` kind reaches
   * the webhook, so the dedupe bounds the notification rate. Never rejects: a
   * failed write is logged as `ai.catalog.alert_failed` and the rest are still
   * raised.
   */
  async raise(findings: readonly WatchFinding[]): Promise<RaisedAlerts> {
    let opened = 0;
    let failed = 0;
    for (const finding of findings) {
      try {
        if (await this.open(finding)) {
          opened += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.warn({
          event: 'ai.catalog.alert_failed',
          subject: finding.subject,
          kind: finding.kind,
          reason: reasonOf(error),
        });
      }
    }
    return { opened, failed };
  }

  private async open({
    subject,
    kind,
    detail,
  }: WatchFinding): Promise<boolean> {
    const opened = await this.repo.createAlert(subject, kind, detail);
    if (opened && NOTIFYING_ALERT_KINDS.includes(kind)) {
      this.webhook.notify(CATALOG_ALERT_EVENT, { kind, subject, detail });
    }
    return opened;
  }
}
