import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import { WebhookAlertService } from './webhook-alert.service';

const fetchMock = vi.fn();

describe('WebhookAlertService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('logs ai.capability.unavailable once at init when AI_ALERT_WEBHOOK_URL is missing', () => {
    const service = new WebhookAlertService(createMockConfig());
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    service.onModuleInit();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith({
      event: 'ai.capability.unavailable',
      capability: 'alerts',
      env: 'AI_ALERT_WEBHOOK_URL',
    });
  });

  it('stays quiet at init when AI_ALERT_WEBHOOK_URL is set', () => {
    const service = new WebhookAlertService(
      createMockConfig({ AI_ALERT_WEBHOOK_URL: 'https://alerts.example/hook' })
    );
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    service.onModuleInit();

    expect(warn).not.toHaveBeenCalled();
  });

  it('should be a no-op when AI_ALERT_WEBHOOK_URL is not configured', () => {
    const service = new WebhookAlertService(createMockConfig());

    service.notify('budget.warning', { userId: 'u1' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should POST the event payload as JSON with a timeout signal', () => {
    const service = new WebhookAlertService(
      createMockConfig({ AI_ALERT_WEBHOOK_URL: 'https://alerts.example/hook' })
    );

    service.notify('cooldown_start', { provider: 'anthropic' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://alerts.example/hook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.event).toBe('cooldown_start');
    expect(body.provider).toBe('anthropic');
    expect(body.at).toEqual(expect.any(String));
  });

  it('should swallow network failures without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    const service = new WebhookAlertService(
      createMockConfig({ AI_ALERT_WEBHOOK_URL: 'https://alerts.example/hook' })
    );

    expect(() =>
      service.notify('budget.warning', { userId: 'u1' })
    ).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
