import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdvisoryLockClient } from '../../../../test-support/advisory-lock';
import { AgentHealthReportTask } from './agent-health-report.task';

const THRESHOLDS: Record<string, number> = {
  AGENT_TOOL_ERROR_ALERT_RATE: 0.1,
  AGENT_NO_ANSWER_ALERT_RATE: 0.1,
};

const queries = { collectWindowStats: vi.fn() };
const alerts = { notify: vi.fn() };
const config = { get: vi.fn((key: string) => THRESHOLDS[key]) };

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports without alerting when rates are healthy', async () => {
    queries.collectWindowStats.mockResolvedValue({
      toolCalls: 100,
      toolErrors: 1,
      terminalTurns: 100,
      noAnswerTurns: 1,
    });
    await expect(makeTask().run()).resolves.toBe('reported');
    expect(alerts.notify).not.toHaveBeenCalled();
  });

  it('logs the window stats and crossed signals as agent.health.report', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    queries.collectWindowStats.mockResolvedValue({
      toolCalls: 100,
      toolErrors: 1,
      terminalTurns: 40,
      noAnswerTurns: 4,
    });
    await makeTask().run();
    expect(logSpy).toHaveBeenCalledWith({
      event: 'agent.health.report',
      windowHours: 24,
      toolCalls: 100,
      toolErrors: 1,
      terminalTurns: 40,
      noAnswerTurns: 4,
      signals: ['no_answer_rate'],
    });
  });

  it('notifies one webhook event per crossed signal', async () => {
    queries.collectWindowStats.mockResolvedValue({
      toolCalls: 50,
      toolErrors: 25,
      terminalTurns: 50,
      noAnswerTurns: 25,
    });
    await expect(makeTask().run()).resolves.toBe('reported');
    expect(alerts.notify).toHaveBeenCalledTimes(2);
    expect(alerts.notify).toHaveBeenCalledWith(
      'agent.health.alert',
      expect.objectContaining({ signal: 'tool_error_rate', samples: 50 })
    );
    expect(alerts.notify).toHaveBeenCalledWith(
      'agent.health.alert',
      expect.objectContaining({
        signal: 'no_answer_rate',
        samples: 50,
        threshold: 0.1,
      })
    );
  });

  it('returns locked when another run holds the advisory lock', async () => {
    await expect(makeTask(false).run()).resolves.toBe('locked');
    expect(alerts.notify).not.toHaveBeenCalled();
  });
});
