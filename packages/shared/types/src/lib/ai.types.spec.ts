import { describe, expect, it } from 'vitest';

import { AGENT_STOP_REASON, MESSAGE_STOP_REASON } from './ai.types';

describe('stop reasons', () => {
  it('lists every loop stop reason plus the two interrupted outcomes', () => {
    expect(MESSAGE_STOP_REASON).toEqual([
      'completed',
      'max_steps',
      'length',
      'token_budget',
      'content_filter',
      'error',
      'aborted',
    ]);
    expect(Object.values(AGENT_STOP_REASON)).toEqual([
      'completed',
      'max_steps',
      'length',
      'token_budget',
      'content_filter',
    ]);
  });
});
