import { describe, expect, it } from 'vitest';

import { createExecutionContext } from '../../testing/create-execution-context';
import { anonIpSubject } from './anonymous-ip-subject';

describe('anonIpSubject', () => {
  it('hashes an anonymous caller IP into the subject the budgets already use', () => {
    expect(
      anonIpSubject(
        createExecutionContext({ tier: 'anonymous', clientIp: '203.0.113.7' })
      )
    ).toBe('ip:fec52565aa0cf18f');
  });

  it('gives a registered caller no IP subject', () => {
    expect(
      anonIpSubject(
        createExecutionContext({ tier: 'free', clientIp: '203.0.113.7' })
      )
    ).toBeUndefined();
  });

  it('gives an anonymous caller without a client IP no IP subject', () => {
    expect(
      anonIpSubject(createExecutionContext({ tier: 'anonymous' }))
    ).toBeUndefined();
  });
});
