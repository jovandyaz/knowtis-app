import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogAlertKind } from '@knowtis/shared-types';

import type { WatchFinding } from '../../domain/model-catalog/model-watch';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import type { WebhookAlertService } from '../alerting/webhook-alert.service';
import { CatalogAlertsWriter } from './catalog-alerts.writer';

const DEAD_PIN = 'openrouter:qwen/qwen3.8-max';
const CANDIDATE = 'openrouter:z-ai/glm-5.3';
const URGENT_KINDS = [
  'selector_empty',
  'gate_failed',
  'pin_unavailable',
  'sync_stale',
] as const satisfies readonly CatalogAlertKind[];
const QUIET_KINDS = [
  'unavailable',
  'retirement_scheduled',
  'resolution_pending',
  'sync_rejected',
  'family_drift',
] as const satisfies readonly CatalogAlertKind[];

function finding(
  kind: CatalogAlertKind,
  subject: string = DEAD_PIN
): WatchFinding {
  return { subject, kind, detail: `${kind} on ${subject}` };
}

function make() {
  const repo = createCatalogRepositoryStub(async () => []);
  const webhook = { notify: vi.fn<WebhookAlertService['notify']>() };
  const writer = new CatalogAlertsWriter(
    repo,
    webhook as unknown as WebhookAlertService
  );
  return { writer, repo, webhook };
}

describe('CatalogAlertsWriter', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('notifies once for a newly opened urgent alert', async () => {
    const { writer, repo, webhook } = make();
    const dead = finding('pin_unavailable');

    expect(await writer.raise([dead])).toEqual({ opened: 1, failed: 0 });

    expect(repo.createAlert).toHaveBeenCalledWith(
      DEAD_PIN,
      'pin_unavailable',
      dead.detail
    );
    expect(webhook.notify).toHaveBeenCalledTimes(1);
    expect(webhook.notify).toHaveBeenCalledWith('ai.catalog.alert', {
      kind: 'pin_unavailable',
      subject: DEAD_PIN,
      detail: dead.detail,
    });
  });

  it('never notifies a deduped alert', async () => {
    const { writer, repo, webhook } = make();
    vi.mocked(repo.createAlert).mockResolvedValue(false);

    expect(await writer.raise([finding('gate_failed', CANDIDATE)])).toEqual({
      opened: 0,
      failed: 0,
    });
    expect(webhook.notify).not.toHaveBeenCalled();
  });

  it('never notifies resolution_pending', async () => {
    const { writer, webhook } = make();

    expect(
      await writer.raise([finding('resolution_pending', CANDIDATE)])
    ).toEqual({ opened: 1, failed: 0 });
    expect(webhook.notify).not.toHaveBeenCalled();
  });

  it.each(URGENT_KINDS)('notifies a newly opened %s alert', async (kind) => {
    const { writer, webhook } = make();

    await writer.raise([finding(kind)]);

    expect(webhook.notify).toHaveBeenCalledWith(
      'ai.catalog.alert',
      expect.objectContaining({ kind })
    );
  });

  it.each(QUIET_KINDS)('only stores a newly opened %s alert', async (kind) => {
    const { writer, repo, webhook } = make();

    await writer.raise([finding(kind)]);

    expect(repo.createAlert).toHaveBeenCalledTimes(1);
    expect(webhook.notify).not.toHaveBeenCalled();
  });

  it('keeps raising after one alert fails', async () => {
    const { writer, repo, webhook } = make();
    vi.mocked(repo.createAlert)
      .mockRejectedValueOnce(new Error('alerts table locked'))
      .mockResolvedValueOnce(true);

    expect(
      await writer.raise([
        finding('pin_unavailable'),
        finding('selector_empty', 'platform.fast'),
      ])
    ).toEqual({ opened: 1, failed: 1 });

    expect(repo.createAlert).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith({
      event: 'ai.catalog.alert_failed',
      subject: DEAD_PIN,
      kind: 'pin_unavailable',
      reason: 'alerts table locked',
    });
    expect(webhook.notify).toHaveBeenCalledTimes(1);
    expect(webhook.notify).toHaveBeenCalledWith(
      'ai.catalog.alert',
      expect.objectContaining({ subject: 'platform.fast' })
    );
  });

  it('opens nothing for no findings', async () => {
    const { writer, repo } = make();

    expect(await writer.raise([])).toEqual({ opened: 0, failed: 0 });
    expect(repo.createAlert).not.toHaveBeenCalled();
  });
});
