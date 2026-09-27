import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdvisoryLockClient } from '../../../../test-support/advisory-lock';
import { AgentHealthReportTask } from './agent-health-report.task';

const queries = { collectWindowStats: vi.fn() };
const alerts = { notify: vi.fn() };
const config = {
  get: vi.fn((key: string) =>
    key === 'AGENT_TOOL_ERROR_ALERT_RATE' ? 0.1 : 0.2
  ),
};

function makeTask(locked = true): AgentHealthReportTask {
  const lock = createAdvisoryLockClient(locked);
  return new AgentHealthReportTask(
    lock.client,
    config as never,
    queries as never,
    alerts as never
  );
}

describe('AgentHealthReportTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports without alerting when rates are healthy', async () => {
    queries.collectWindowStats.mockResolvedValue({
      toolCalls: 100,
      toolErrors: 1,
      stopTurns: 100,
      anomalousStops: 1,
    });
    await expect(makeTask().run()).resolves.toBe('reported');
    expect(alerts.notify).not.toHaveBeenCalled();
  });

  it('notifies one webhook event per crossed signal', async () => {
    queries.collectWindowStats.mockResolvedValue({
      toolCalls: 50,
      toolErrors: 25,
      stopTurns: 50,
      anomalousStops: 25,
    });
    await expect(makeTask().run()).resolves.toBe('reported');
    expect(alerts.notify).toHaveBeenCalledTimes(2);
    expect(alerts.notify).toHaveBeenCalledWith(
      'agent.health.alert',
      expect.objectContaining({ signal: 'tool_error_rate', samples: 50 })
    );
    expect(alerts.notify).toHaveBeenCalledWith(
      'agent.health.alert',
      expect.objectContaining({ signal: 'stop_anomaly_rate', samples: 50 })
    );
  });

  it('returns locked when another run holds the advisory lock', async () => {
    await expect(makeTask(false).run()).resolves.toBe('locked');
    expect(alerts.notify).not.toHaveBeenCalled();
  });
});
