import { describe, expect, it } from 'vitest';

import { UserScopedThrottlerGuard } from './user-scoped-throttler.guard';

type Tracker = (req: Record<string, unknown>) => Promise<string>;

const guard = Object.create(
  UserScopedThrottlerGuard.prototype
) as UserScopedThrottlerGuard;
const getTracker = (
  guard as unknown as { getTracker: Tracker }
).getTracker.bind(guard);

describe('UserScopedThrottlerGuard', () => {
  it('buckets an authenticated request by user id regardless of IP', async () => {
    expect(await getTracker({ user: { id: 'u1' }, ip: '10.0.0.1' })).toBe(
      'user:u1'
    );
    expect(await getTracker({ user: { id: 'u1' }, ip: '203.0.113.9' })).toBe(
      'user:u1'
    );
  });

  it('gives distinct users separate buckets on the same IP', async () => {
    const a = await getTracker({ user: { id: 'u1' }, ip: '10.0.0.1' });
    const b = await getTracker({ user: { id: 'u2' }, ip: '10.0.0.1' });
    expect(a).not.toBe(b);
  });

  it('falls back to the IP tracker for an unauthenticated request', async () => {
    expect(await getTracker({ ip: '198.51.100.7' })).toBe('198.51.100.7');
  });

  it('falls back to the IP tracker when the user id is empty', async () => {
    expect(await getTracker({ user: { id: '' }, ip: '198.51.100.7' })).toBe(
      '198.51.100.7'
    );
  });
});
