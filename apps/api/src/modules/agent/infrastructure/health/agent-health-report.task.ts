import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Sql } from 'postgres';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { DATABASE_CLIENT, runWithAdvisoryLock } from '../../../../database';
import { WebhookAlertService } from '../../../ai/infrastructure/alerting/webhook-alert.service';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { evaluateAgentHealth } from './agent-health.evaluator';
import { AgentHealthQueries } from './agent-health.queries';

const ADVISORY_LOCK_KEY = 778_493_004;
const WINDOW_HOURS = 24;
const MIN_SAMPLES = 20;

export type AgentHealthRunStatus = 'reported' | 'flag_disabled' | 'locked';

@Injectable()
export class AgentHealthReportTask {
  private readonly logger = new Logger(AgentHealthReportTask.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly client: Sql,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly flags: FeatureFlagsService,
    private readonly queries: AgentHealthQueries,
    private readonly alerts: WebhookAlertService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM, { timeZone: 'UTC' })
  async report(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error({
        event: 'agent.health.report_failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async run(): Promise<AgentHealthRunStatus> {
    if (!(await this.flags.isEnabled(FEATURE_FLAG_KEYS.AGENT_HEALTH_ALERTS))) {
      return 'flag_disabled';
    }
    const outcome = await runWithAdvisoryLock(
      this.client,
      ADVISORY_LOCK_KEY,
      () => this.collectAndReport()
    );
    if (!outcome.acquired) {
      this.logger.log({
        event: 'agent.health.report_skipped',
        reason: 'another run holds the lock',
      });
      return 'locked';
    }
    return 'reported';
  }

  private async collectAndReport(): Promise<void> {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
    const stats = await this.queries.collectWindowStats(since);
    const signals = evaluateAgentHealth(stats, {
      toolErrorRate: this.config.get('AGENT_TOOL_ERROR_ALERT_RATE'),
      stopAnomalyRate: this.config.get('AGENT_STOP_ANOMALY_ALERT_RATE'),
      minSamples: MIN_SAMPLES,
    });
    this.logger.log({
      event: 'agent.health.report',
      windowHours: WINDOW_HOURS,
      ...stats,
      signals: signals.map((s) => s.signal),
    });
    for (const signal of signals) {
      this.alerts.notify('agent.health.alert', {
        windowHours: WINDOW_HOURS,
        ...signal,
      });
    }
  }
}
