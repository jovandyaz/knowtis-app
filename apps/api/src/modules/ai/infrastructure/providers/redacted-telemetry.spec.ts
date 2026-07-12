import { describe, expect, it } from 'vitest';

import { buildRedactedTelemetry } from './redacted-telemetry';

describe('buildRedactedTelemetry', () => {
  it('redacts input/output when recordContent is false', () => {
    const result = buildRedactedTelemetry(
      'agent-turn',
      { userId: 'u1', environment: 'production' },
      false
    );
    expect(result.isEnabled).toBe(true);
    expect(result.recordInputs).toBe(false);
    expect(result.recordOutputs).toBe(false);
    expect(result.functionId).toBe('agent-turn');
    expect(result.metadata).toEqual({
      userId: 'u1',
      environment: 'production',
    });
  });

  it('records input/output when recordContent is true', () => {
    const result = buildRedactedTelemetry('agent-turn', { userId: 'u1' }, true);
    expect(result.recordInputs).toBe(true);
    expect(result.recordOutputs).toBe(true);
  });
});
