import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COLLABORATION_CLOSE_REASON,
  HANDSHAKE_FAILURE,
} from '@knowtis/shared-types';

import type { AccessSnapshot } from '../notes/domain/access-policy';
import { AccessRevalidationService } from './access-revalidation.service';

const owner = { userId: 'owner', suppliedTokenFingerprint: null };
const guest = { userId: 'guest', suppliedTokenFingerprint: null };
const initial: AccessSnapshot = {
  ownerId: 'owner',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  shareTokenFingerprint: null,
  directPermissions: [{ userId: 'guest', permission: 'editor' }],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('active access leases', () => {
  let service: AccessRevalidationService;
  let snapshot: AccessSnapshot | null;
  let reads: ReturnType<typeof vi.fn<() => Promise<AccessSnapshot | null>>>;
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'performance',
      ],
    });
    snapshot = structuredClone(initial);
    reads = vi.fn(async () => snapshot);
    service = new AccessRevalidationService({ findAccessSnapshot: reads });
    service.onModuleInit();
  });
  afterEach(() => {
    service.onModuleDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('closes a downgraded session while an unchanged owner remains valid', async () => {
    const [editor, own] = await Promise.all([
      service.acquire('note', guest),
      service.acquire('note', owner),
    ]);
    const editorConnection = { close: vi.fn(), onClose: vi.fn() };
    const ownerConnection = { close: vi.fn(), onClose: vi.fn() };
    service.register(editor, editorConnection);
    service.register(own, ownerConnection);
    snapshot = {
      ...initial,
      directPermissions: [{ userId: 'guest', permission: 'viewer' }],
    };
    await service.invalidate('note');
    await vi.advanceTimersByTimeAsync(1);
    expect(editor.closed).toBe(true);
    expect(editorConnection.close).toHaveBeenCalledExactlyOnceWith({
      code: 4403,
      reason: COLLABORATION_CLOSE_REASON.ACCESS_CHANGED,
    });
    expect(own.closed).toBe(false);
    expect(ownerConnection.close).not.toHaveBeenCalled();
    expect((await service.acquire('note', guest)).effectiveAccess).toBe(
      'viewer'
    );
  });

  it('recovers an unannounced revocation with the periodic primary read', async () => {
    const session = await service.acquire('note', guest);
    snapshot = { ...initial, directPermissions: [] };
    await vi.advanceTimersByTimeAsync(1100);
    expect(session.closed).toBe(true);
  });

  it('keeps the same effective link permission when a direct grant is removed', async () => {
    snapshot = {
      ...initial,
      generalAccess: 'anyone_with_link',
      generalAccessPermission: 'editor',
      shareTokenFingerprint: 'link',
    };
    const session = await service.acquire('note', {
      ...guest,
      suppliedTokenFingerprint: 'link',
    });
    snapshot = { ...snapshot, directPermissions: [] };
    await service.invalidate('note');
    await vi.advanceTimersByTimeAsync(1);
    expect(session.closed).toBe(false);
    expect(session.effectiveAccess).toBe('editor');
  });

  it('retains ownership for an administrator who owns the note', async () => {
    expect((await service.acquire('note', owner, true)).effectiveAccess).toBe(
      'owner'
    );
  });

  it('denies a deleted note including administrative access', async () => {
    const admin = await service.acquire('note', guest, true);
    snapshot = null;
    await service.invalidate('note');
    await vi.advanceTimersByTimeAsync(1);
    expect(admin.closed).toBe(true);
    await expect(service.acquire('note', guest, true)).rejects.toThrow(
      HANDSHAKE_FAILURE.NOTE_NOT_FOUND
    );
  });

  it('coalesces a burst and never applies a pre-invalidation response', async () => {
    const session = await service.acquire('note', guest);
    await vi.advanceTimersByTimeAsync(0);
    const pending = deferred<AccessSnapshot>();
    reads.mockImplementationOnce(() => pending.promise);
    await service.invalidate('note');
    for (let i = 0; i < 100; i++) {
      void service.invalidate('note');
    }
    snapshot = { ...initial, directPermissions: [] };
    pending.resolve(initial);
    await vi.advanceTimersByTimeAsync(1);
    expect(session.closed).toBe(true);
    expect(reads).toHaveBeenCalledTimes(3);
  });

  it('releases a lease when hydration never registers its connection', async () => {
    const lease = await service.acquire('note', guest);
    await vi.advanceTimersByTimeAsync(2100);
    expect(lease.closed).toBe(true);
    expect(service.diagnostics.activeNotes).toBe(0);
  });

  it('closes a connection registered after revocation with the original reason', async () => {
    const lease = await service.acquire('note', guest);
    snapshot = { ...initial, directPermissions: [] };
    await service.invalidate('note');
    await vi.advanceTimersByTimeAsync(1);
    expect(lease.closed).toBe(true);
    const connection = { close: vi.fn(), onClose: vi.fn() };

    service.register(lease, connection);

    expect(connection.close).toHaveBeenCalledExactlyOnceWith({
      code: 4403,
      reason: COLLABORATION_CLOSE_REASON.ACCESS_CHANGED,
    });
    expect(service.diagnostics.activeNotes).toBe(0);
  });

  it('closes once when registration reaches expiry before the periodic sweep', async () => {
    const lease = await service.acquire('note', guest);
    const connection = { close: vi.fn(), onClose: vi.fn() };
    vi.spyOn(performance, 'now').mockReturnValue(lease.expiresAt);
    expect(lease.closed).toBe(false);

    service.register(lease, connection);

    expect(lease.closed).toBe(true);
    expect(connection.close).toHaveBeenCalledExactlyOnceWith({
      code: 4403,
      reason: COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(service.diagnostics.activeNotes).toBe(0);
  });

  it('releases the lease and stops renewal when the registered socket closes', async () => {
    const lease = await service.acquire('note', guest);
    const connection = {
      close: vi.fn(),
      onClose: vi.fn<(callback: () => void) => void>(),
    };
    service.register(lease, connection);
    expect(connection.onClose).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);

    connection.onClose.mock.calls[0][0]();

    expect(lease.closed).toBe(true);
    expect(service.diagnostics.activeNotes).toBe(0);
    const completedReads = reads.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2100);
    expect(reads).toHaveBeenCalledTimes(completedReads);
  });

  it('expires idle and preconnected sessions and never revives them on late SQL completion', async () => {
    const session = await service.acquire('note', guest);
    const pending = deferred<AccessSnapshot>();
    reads.mockImplementation(() => pending.promise);
    await vi.advanceTimersByTimeAsync(2100);
    expect(session.closed).toBe(true);
    expect(() => service.assertValid(session)).toThrow();
    pending.resolve(initial);
    await vi.advanceTimersByTimeAsync(10);
    expect(session.closed).toBe(true);
  });

  it('retains SQL admission after caller timeout and bounds the waiting queue', async () => {
    const pending = deferred<AccessSnapshot>();
    reads.mockImplementation(() => pending.promise);
    const attempts = Array.from({ length: 100 }, (_, i) =>
      service.acquire(`note-${i}`, guest).catch(() => null)
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(service.diagnostics.activeReads).toBe(2);
    expect(service.diagnostics.queuedNotes).toBe(0);
    expect(service.diagnostics.peakQueuedNotes).toBeLessThanOrEqual(64);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toHaveBeenCalledTimes(2);
    pending.resolve(initial);
    await Promise.all(attempts);
    await vi.advanceTimersByTimeAsync(1);
    expect(service.diagnostics.activeReads).toBe(0);
  });

  it('fails closed on authority error without leaking SQL details', async () => {
    const warnings = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const session = await service.acquire('note', guest);
    const canary =
      'postgres://user:password@private/sql recipient@example.test token-canary fingerprint-canary SELECT content';
    reads.mockRejectedValue(new Error(canary));
    await service.invalidate('note');
    await vi.advanceTimersByTimeAsync(1);
    expect(session.closed).toBe(true);
    await expect(service.acquire('note', guest)).rejects.toThrow(
      HANDSHAKE_FAILURE.INTERNAL_ERROR
    );
    expect(warnings).toHaveBeenCalledExactlyOnceWith({
      operation: 'access_snapshot_read',
      authority: 'postgresql_primary',
      reason: 'query_failed',
    });
    expect(JSON.stringify(warnings.mock.calls)).not.toContain(canary);
  });

  it('bounds primary failure warnings across notes while counting every failed read', async () => {
    const warnings = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    reads.mockRejectedValue(new Error('private driver error'));
    for (let i = 0; i < 30; i++) {
      await expect(service.acquire(`note-${i}`, guest)).rejects.toThrow(
        HANDSHAKE_FAILURE.INTERNAL_ERROR
      );
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(warnings).toHaveBeenCalledTimes(1);
    expect(service.diagnostics.failedReads).toBe(30);
    await vi.advanceTimersByTimeAsync(30000);
    await expect(service.acquire('after-cooldown', guest)).rejects.toThrow(
      HANDSHAKE_FAILURE.INTERNAL_ERROR
    );
    expect(warnings).toHaveBeenCalledTimes(2);
  });

  it('reports a stalled primary read deadline without releasing SQL admission', async () => {
    const warnings = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const slow = deferred<AccessSnapshot | null>();
    reads.mockReturnValue(slow.promise);
    const waiting = expect(service.acquire('note', guest)).rejects.toThrow(
      HANDSHAKE_FAILURE.INTERNAL_ERROR
    );
    await vi.advanceTimersByTimeAsync(1100);
    await waiting;
    expect(service.diagnostics.activeReads).toBe(1);
    expect(service.diagnostics.timedOutReads).toBe(1);
    expect(warnings).toHaveBeenCalledExactlyOnceWith({
      operation: 'access_snapshot_read',
      authority: 'postgresql_primary',
      reason: 'deadline_exceeded',
    });
    slow.resolve(initial);
    await vi.advanceTimersByTimeAsync(1);
    expect(service.diagnostics.activeReads).toBe(0);
  });
});
