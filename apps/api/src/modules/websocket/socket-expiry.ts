export const TOKEN_EXPIRY_GRACE_MS = 5000;

// setTimeout overflows past 2^31-1 ms and fires immediately; longer-lived
// tokens outlive any realistic socket, so no timer is armed for them.
export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export class SocketExpiryTimers {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  arm(clientId: string, tokenExpiresAtMs: number, onExpire: () => void): void {
    this.clear(clientId);
    const delay = tokenExpiresAtMs + TOKEN_EXPIRY_GRACE_MS - Date.now();
    if (delay > MAX_TIMER_DELAY_MS) {
      return;
    }
    const timer = setTimeout(
      () => {
        this.timers.delete(clientId);
        onExpire();
      },
      Math.max(delay, 0)
    );
    timer.unref?.();
    this.timers.set(clientId, timer);
  }

  clear(clientId: string): void {
    const timer = this.timers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(clientId);
    }
  }
}
