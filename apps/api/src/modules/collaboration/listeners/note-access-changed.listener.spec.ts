import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessRevalidationService } from '../access-revalidation.service';
import { NoteAccessChangedListener } from './note-access-changed.listener';

describe('committed access changes', () => {
  let service: AccessRevalidationService;
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
  });
  afterEach(() => {
    service?.onModuleDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it('revalidates locally when Redis publication fails without failing the committed operation', async () => {
    let snapshot = {
      ownerId: 'owner',
      generalAccess: 'restricted' as const,
      generalAccessPermission: 'viewer' as const,
      shareTokenFingerprint: null,
      directPermissions: [{ userId: 'guest', permission: 'editor' as const }],
    };
    service = new AccessRevalidationService({
      findAccessSnapshot: async () => snapshot,
    });
    service.onModuleInit();
    const lease = await service.acquire('note', {
      userId: 'guest',
      suppliedTokenFingerprint: null,
    });
    snapshot = { ...snapshot, directPermissions: [] };
    const listener = new NoteAccessChangedListener(service, {
      publish: async () => {
        throw new Error('offline');
      },
    } as never);
    const warnings = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await expect(
      listener.handle({ noteId: 'note' } as never)
    ).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(lease.closed).toBe(true);
    expect(warnings).toHaveBeenCalledExactlyOnceWith(
      'Access invalidation delivery unavailable; primary renewal remains active'
    );
  });
});
