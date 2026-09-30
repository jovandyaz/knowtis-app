/**
 * Per-user concurrency slots with per-client AbortController registry.
 * In-memory tracking — enforced per-instance only. If horizontally scaled,
 * move to Redis (e.g. ai:streams:{userId} sorted set).
 */
export class ConcurrencySlotTracker {
  private readonly controllers = new Map<string, AbortController>();
  private readonly userCounts = new Map<string, number>();
  private readonly clientSlots = new Map<string, Set<string>>();
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly maxConcurrentPerUser: number) {}

  /** Registers the slot and returns true, or returns false when the user is at the limit. */
  acquire(
    userId: string,
    clientId: string,
    slotId: string,
    controller: AbortController
  ): boolean {
    if (this.controllers.has(slotId)) {
      return false;
    }
    if ((this.userCounts.get(userId) ?? 0) >= this.maxConcurrentPerUser) {
      return false;
    }
    this.controllers.set(slotId, controller);
    this.userCounts.set(userId, (this.userCounts.get(userId) ?? 0) + 1);
    const slots = this.clientSlots.get(clientId) ?? new Set<string>();
    slots.add(slotId);
    this.clientSlots.set(clientId, slots);
    return true;
  }

  /** Idempotent: a second release of the same slot is a no-op. */
  release(userId: string, clientId: string, slotId: string): void {
    if (!this.controllers.delete(slotId)) {
      return;
    }
    const slots = this.clientSlots.get(clientId);
    if (slots) {
      slots.delete(slotId);
      if (slots.size === 0) {
        this.clientSlots.delete(clientId);
      }
    }
    const count = this.userCounts.get(userId) ?? 0;
    if (count <= 1) {
      this.userCounts.delete(userId);
    } else {
      this.userCounts.set(userId, count - 1);
    }
    if (this.controllers.size === 0 && this.idleWaiters.length > 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const waiter of waiters) {
        waiter();
      }
    }
  }

  abortAll(reason?: unknown): void {
    for (const controller of this.controllers.values()) {
      controller.abort(reason);
    }
  }

  /** Resolves true once no slot is held, or false when `timeoutMs` passes first. */
  whenIdle(timeoutMs: number): Promise<boolean> {
    if (this.controllers.size === 0) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const onIdle = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.idleWaiters = this.idleWaiters.filter((w) => w !== onIdle);
        resolve(false);
      }, timeoutMs);
      this.idleWaiters.push(onIdle);
    });
  }

  abortAllForClient(clientId: string, reason?: unknown): void {
    const slotIds = this.clientSlots.get(clientId);
    if (!slotIds) {
      return;
    }
    for (const slotId of slotIds) {
      this.controllers.get(slotId)?.abort(reason);
    }
  }

  isActive(slotId: string): boolean {
    return this.controllers.has(slotId);
  }

  hasActiveSlots(clientId: string): boolean {
    return (this.clientSlots.get(clientId)?.size ?? 0) > 0;
  }
}
