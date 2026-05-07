import { describe, expect, it, vi } from 'vitest';

import { NoteUpdatedEvent } from '../../notes/domain/events';
import type { HocuspocusService } from '../hocuspocus.service';
import { NoteUpdatedListener } from './note-updated.listener';

describe('NoteUpdatedListener', () => {
  function makeService(
    overrides: Partial<HocuspocusService> = {}
  ): HocuspocusService {
    return {
      applyExternalUpdate: vi.fn().mockResolvedValue(true),
      ...overrides,
    } as unknown as HocuspocusService;
  }

  it('should call applyExternalUpdate when content and yjsState are present', async () => {
    const service = makeService();
    const listener = new NoteUpdatedListener(service);
    const yjsState = Buffer.from([1, 2, 3]);

    const event = new NoteUpdatedEvent(
      'note-1',
      { content: '<p>updated</p>' },
      'user-1',
      yjsState
    );

    await listener.handleExternalNoteUpdate(event);

    expect(service.applyExternalUpdate).toHaveBeenCalledTimes(1);
    const [calledNoteId, calledUpdate] = vi.mocked(service.applyExternalUpdate)
      .mock.calls[0];
    expect(calledNoteId).toBe('note-1');
    expect(calledUpdate).toBeInstanceOf(Uint8Array);
    expect(Array.from(calledUpdate)).toEqual([1, 2, 3]);
  });

  it('should ignore events with empty (zero-length) yjsState buffers', async () => {
    const service = makeService();
    const listener = new NoteUpdatedListener(service);

    const event = new NoteUpdatedEvent(
      'note-1',
      { content: '<p>updated</p>' },
      'user-1',
      Buffer.alloc(0)
    );

    await listener.handleExternalNoteUpdate(event);

    expect(service.applyExternalUpdate).not.toHaveBeenCalled();
  });

  it('should ignore events without content updates', async () => {
    const service = makeService();
    const listener = new NoteUpdatedListener(service);

    const event = new NoteUpdatedEvent(
      'note-1',
      { title: 'New title' },
      'user-1',
      Buffer.from([1, 2, 3])
    );

    await listener.handleExternalNoteUpdate(event);

    expect(service.applyExternalUpdate).not.toHaveBeenCalled();
  });

  it('should ignore events without yjsState', async () => {
    const service = makeService();
    const listener = new NoteUpdatedListener(service);

    const event = new NoteUpdatedEvent(
      'note-1',
      { content: '<p>updated</p>' },
      'user-1'
    );

    await listener.handleExternalNoteUpdate(event);

    expect(service.applyExternalUpdate).not.toHaveBeenCalled();
  });

  it('should swallow errors from applyExternalUpdate (non-fatal)', async () => {
    const service = makeService({
      applyExternalUpdate: vi
        .fn()
        .mockRejectedValue(new Error('hocuspocus down')),
    });
    const listener = new NoteUpdatedListener(service);

    await expect(
      listener.handleExternalNoteUpdate(
        new NoteUpdatedEvent(
          'note-1',
          { content: '<p>updated</p>' },
          'user-1',
          Buffer.from([1, 2, 3])
        )
      )
    ).resolves.toBeUndefined();
  });
});
