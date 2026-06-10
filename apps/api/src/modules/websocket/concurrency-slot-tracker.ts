/**
 * Per-user concurrency slots with per-client AbortController registry.
 * In-memory tracking — enforced per-instance only. If horizontally scaled,
 * move to Redis (e.g. ai:streams:{userId} sorted set).
 */
export class ConcurrencySlotTracker {
  private readonly controllers = new Map<string, AbortController>();
  private readonly userCounts = new Map<string, number>();
  private readonly clientSlots = new Map<string, Set<string>>();

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
  }

  abortAllForClient(clientId: string): void {
    const slotIds = this.clientSlots.get(clientId);
    if (!slotIds) {
      return;
    }
    for (const slotId of slotIds) {
      this.controllers.get(slotId)?.abort();
    }
  }

  hasActiveSlots(clientId: string): boolean {
    return (this.clientSlots.get(clientId)?.size ?? 0) > 0;
  }
}
