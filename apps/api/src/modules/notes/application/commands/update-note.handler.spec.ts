import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

import {
  NoteEntity,
  NoteErrorCodes,
  NoteErrors,
  NoteRepository,
} from '../../domain';
import { NoteUpdatedEvent } from '../../domain/events';
import * as htmlToYjsModule from '../../infrastructure/html-to-yjs';
import { UpdateNoteHandler } from './update-note.handler';

const mockNote: NoteEntity = {
  id: 'note-1',
  title: 'Original Title',
  content: 'Original Content',
  ownerId: 'owner-1',
  generalAccess: GENERAL_ACCESS.RESTRICTED,
  generalAccessPermission: PERMISSION.VIEWER,
  shareToken: null,
  editorsCanShare: false,
  yjsState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UpdateNoteHandler', () => {
  let handler: UpdateNoteHandler;
  let mockRepository: NoteRepository;
  let mockEventEmitter: EventEmitter2;

  beforeEach(() => {
    mockRepository = {
      findById: vi.fn(),
      findByIdWithOwner: vi.fn(),
      findByOwner: vi.fn(),
      findAccessibleByUser: vi.fn(),
      findByShareToken: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
      updateContentWithYjsState: vi.fn(),
      delete: vi.fn(),
      findPermission: vi.fn(),
      findPermissionsByNote: vi.fn(),
      createPermission: vi.fn(),
      updatePermission: vi.fn(),
      deletePermission: vi.fn(),
      hasAccess: vi.fn(),
    };

    mockEventEmitter = {
      emit: vi.fn(),
    } as unknown as EventEmitter2;

    handler = new UpdateNoteHandler(mockRepository, mockEventEmitter);
  });

  it('should allow owner to update all fields and emit event', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'update').mockResolvedValue(
      ok({ ...mockNote, title: 'New Title' })
    );

    const input = {
      noteId: 'note-1',
      userId: 'owner-1',
      title: 'New Title',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
      generalAccessPermission: PERMISSION.EDITOR,
    };

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({
        title: 'New Title',
        generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
        generalAccessPermission: PERMISSION.EDITOR,
      })
    );

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      NoteUpdatedEvent.EVENT_NAME,
      expect.any(NoteUpdatedEvent)
    );
  });

  it('should generate share token when enabling anyone_with_link and no token exists', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'update').mockResolvedValue(ok(mockNote));

    const input = {
      noteId: 'note-1',
      userId: 'owner-1',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
    };

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({
        generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
        shareToken: expect.stringMatching(/^[a-f0-9]{32}$/),
      })
    );
  });

  it('should clear share token when changing to restricted', async () => {
    const noteWithToken: NoteEntity = {
      ...mockNote,
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
      shareToken: 'existing-token-abc123',
    };

    vi.spyOn(mockRepository, 'findById').mockResolvedValue(noteWithToken);
    vi.spyOn(mockRepository, 'update').mockResolvedValue(ok(noteWithToken));

    const input = {
      noteId: 'note-1',
      userId: 'owner-1',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({
        generalAccess: GENERAL_ACCESS.RESTRICTED,
        shareToken: null,
      })
    );
  });

  it('should allow editor to update content atomically with yjsState', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'hasAccess').mockResolvedValue(true);
    vi.spyOn(mockRepository, 'updateContentWithYjsState').mockResolvedValue(
      ok({ ...mockNote, content: '<p>New Content</p>' })
    );

    const input = {
      noteId: 'note-1',
      userId: 'editor-1',
      content: '<p>New Content</p>',
    };

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    expect(mockRepository.hasAccess).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({ value: 'editor-1' }),
      'editor'
    );
    expect(mockRepository.updateContentWithYjsState).toHaveBeenCalledTimes(1);
    expect(mockRepository.update).not.toHaveBeenCalled();
    const [noteIdArg, dataArg, bufferArg] = vi.mocked(
      mockRepository.updateContentWithYjsState
    ).mock.calls[0];
    expect(noteIdArg).toBe('note-1');
    expect(dataArg).toEqual({ content: '<p>New Content</p>' });
    expect(Buffer.isBuffer(bufferArg)).toBe(true);
    expect((bufferArg as Buffer).byteLength).toBeGreaterThan(0);
  });

  it('should take atomic transactional path when owner updates content', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'updateContentWithYjsState').mockResolvedValue(
      ok({ ...mockNote, content: '<p>New</p>' })
    );

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<p>New</p>',
    });

    expect(result.isOk()).toBe(true);
    expect(mockRepository.updateContentWithYjsState).toHaveBeenCalledTimes(1);
    expect(mockRepository.update).not.toHaveBeenCalled();
    expect(mockRepository.updateYjsState).not.toHaveBeenCalled();
  });

  it('should skip yjsState regen when only sharing fields change (non-atomic path)', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'update').mockResolvedValue(ok(mockNote));

    await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
    });

    expect(mockRepository.update).toHaveBeenCalled();
    expect(mockRepository.updateContentWithYjsState).not.toHaveBeenCalled();
    expect(mockRepository.updateYjsState).not.toHaveBeenCalled();
  });

  it('should return INVALID_CONTENT and not touch DB when HTML parsing throws', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(htmlToYjsModule, 'htmlToYjsState').mockImplementationOnce(() => {
      throw new Error('malformed HTML');
    });

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<garbage>',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.INVALID_CONTENT);
      expect(result.error.message).toContain('malformed HTML');
    }
    expect(mockRepository.updateContentWithYjsState).not.toHaveBeenCalled();
    expect(mockRepository.update).not.toHaveBeenCalled();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should deny editor from changing sharing settings', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'hasAccess').mockResolvedValue(true);

    const input = {
      noteId: 'note-1',
      userId: 'editor-1',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
    };

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(
        NoteErrors.ownerOnly('change sharing settings')
      );
    }
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('should fail if note not found', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(null);

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'user-1',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.NOTE_NOT_FOUND);
    }
  });

  it('should fail if user has no permission', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'hasAccess').mockResolvedValue(false);

    const input = {
      noteId: 'note-1',
      userId: 'stranger-1',
      title: 'Hacked',
    };

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
    }
  });
});
