import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VERIFICATION_RESEND_COOLDOWN_MS } from '../constants';
import { msUntilResendAllowed } from '../verification/resend-cooldown';

const NOW = new Date('2026-08-26T12:00:00.000Z');

describe('msUntilResendAllowed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves the whole window when the email has just gone out', () => {
    expect(msUntilResendAllowed(new Date())).toBe(
      VERIFICATION_RESEND_COOLDOWN_MS
    );
  });

  it('shrinks by exactly the time already spent waiting', () => {
    const issuedAt = new Date();

    vi.advanceTimersByTime(20_000);
    expect(msUntilResendAllowed(issuedAt)).toBe(
      VERIFICATION_RESEND_COOLDOWN_MS - 20_000
    );

    vi.advanceTimersByTime(25_000);
    expect(msUntilResendAllowed(issuedAt)).toBe(
      VERIFICATION_RESEND_COOLDOWN_MS - 45_000
    );
  });

  it('reports nothing left the instant the window closes', () => {
    const issuedAt = new Date();
    vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_MS);

    expect(msUntilResendAllowed(issuedAt)).toBe(0);
  });

  it('never reports a negative wait for a long-expired row', () => {
    const issuedAt = new Date(
      NOW.getTime() - VERIFICATION_RESEND_COOLDOWN_MS * 10
    );

    expect(msUntilResendAllowed(issuedAt)).toBe(0);
  });
});
