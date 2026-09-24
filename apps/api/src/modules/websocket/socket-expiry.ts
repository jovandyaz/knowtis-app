import type { Logger } from '@nestjs/common';

import type { ConcurrencySlotTracker } from './concurrency-slot-tracker';
import type { AuthenticatedSocket } from './socket-auth';

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

interface SocketTokenExpiryOptions {
  /** The slots the socket's streamed work holds; expiry waits for the last of them. */
  readonly slots: ConcurrencySlotTracker;
  readonly logger: Pick<Logger, 'log'>;
  readonly deferredEvent: string;
  /** Tells the client its token expired and closes the socket. */
  readonly endSession: (client: AuthenticatedSocket) => void;
}

/**
 * Token expiry for a socket that streams work. Authorization is checked when a
 * request starts, as with an HTTP response whose token expires mid-body: a request
 * authorized before expiry runs to its end, while new requests on the socket are
 * refused. The session ends once no authorized request is in flight and no slot is held.
 * The overstay is bounded by the work's own timeouts: the model stream's cap
 * (`AI_AGENT_MAX_MS` for a copilot turn) plus the bounded steps before and after it.
 */
export class SocketTokenExpiry {
  private readonly timers = new SocketExpiryTimers();
  private readonly expired = new Set<string>();
  private readonly inFlight = new Map<string, number>();

  constructor(private readonly options: SocketTokenExpiryOptions) {}

  arm(client: AuthenticatedSocket, tokenExpiresAtMs: number): void {
    this.timers.arm(client.id, tokenExpiresAtMs, () => this.expire(client));
  }

  isExpired(client: AuthenticatedSocket): boolean {
    return this.expired.has(client.id);
  }

  /** Counts an authorized request as in flight until it settles, so an expiry meanwhile waits for it. */
  async track(
    client: AuthenticatedSocket,
    request: () => Promise<void>
  ): Promise<void> {
    this.inFlight.set(client.id, (this.inFlight.get(client.id) ?? 0) + 1);
    try {
      await request();
    } finally {
      const left = (this.inFlight.get(client.id) ?? 1) - 1;
      if (left > 0) {
        this.inFlight.set(client.id, left);
      } else {
        this.inFlight.delete(client.id);
      }
      this.endIfIdle(client);
    }
  }

  /** Call after every slot release, so an expired socket closes once its last work ends. */
  afterSlotRelease(client: AuthenticatedSocket): void {
    this.endIfIdle(client);
  }

  clear(client: AuthenticatedSocket): void {
    this.timers.clear(client.id);
    this.expired.delete(client.id);
  }

  private isIdle(client: AuthenticatedSocket): boolean {
    return (
      !this.inFlight.has(client.id) &&
      !this.options.slots.hasActiveSlots(client.id)
    );
  }

  private endIfIdle(client: AuthenticatedSocket): void {
    if (this.expired.has(client.id) && this.isIdle(client)) {
      this.end(client);
    }
  }

  private expire(client: AuthenticatedSocket): void {
    if (this.isIdle(client)) {
      this.end(client);
      return;
    }
    this.expired.add(client.id);
    this.options.logger.log({
      event: this.options.deferredEvent,
      clientId: client.id,
      userId: client.data?.userId,
    });
  }

  private end(client: AuthenticatedSocket): void {
    this.expired.delete(client.id);
    this.options.endSession(client);
  }
}
