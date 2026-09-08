import { describe, expect, it } from 'vitest';

import { AccessRevalidationService } from '../access-revalidation.service';
import { NoteAccessChangedListener } from './note-access-changed.listener';

describe('committed access changes', () => {
  it('revalidates locally when Redis publication fails without failing the committed operation', async () => {
    let snapshot = {
      ownerId: 'owner',
      generalAccess: 'restricted' as const,
      generalAccessPermission: 'viewer' as const,
      shareTokenFingerprint: null,
      directPermissions: [{ userId: 'guest', permission: 'editor' as const }],
    };
    const service = new AccessRevalidationService({
      findAccessSnapshot: async () => snapshot,
    });
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
    await expect(
      listener.handle({ noteId: 'note' } as never)
    ).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(lease.closed).toBe(true);
    service.onModuleDestroy();
  });
});
