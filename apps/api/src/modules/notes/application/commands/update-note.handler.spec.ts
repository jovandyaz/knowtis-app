import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NoteEntity,
  NoteErrorCodes,
  NoteErrors,
  NoteRepository,
} from '../../domain';
import { NoteUpdatedEvent } from '../../domain/events';
import { UpdateNoteHandler } from './update-note.handler';

// Mock note constant
const mockNote: NoteEntity = {
  id: 'note-1',
  title: 'Original Title',
  content: 'Original Content',
  ownerId: 'owner-1',
  isPublic: false,
  yjsState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UpdateNoteHandler', () => {
  let handler: UpdateNoteHandler;
  let mockRepository: NoteRepository;
  let mockEventEmitter: EventEmitter2;

  beforeEach(() => {
    // Mock the composite repository
    mockRepository = {
      findById: vi.fn(),
      findByIdWithOwner: vi.fn(),
      findByOwner: vi.fn(),
      findAccessibleByUser: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
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
  // ...
  it('should allow owner to update everything and emit event', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'update').mockResolvedValue(
      ok({ ...mockNote, title: 'New Title' })
    );

    const input = {
      noteId: 'note-1',
      userId: 'owner-1',
      title: 'New Title',
      isPublic: true,
    };

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith('note-1', {
      title: 'New Title',
      isPublic: true,
    });

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      NoteUpdatedEvent.EVENT_NAME,
      expect.any(NoteUpdatedEvent)
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      NoteUpdatedEvent.EVENT_NAME,
      expect.objectContaining({
        aggregateId: 'note-1',
        performedBy: 'owner-1',
        updates: expect.objectContaining({
          title: 'New Title',
          isPublic: true,
        }),
      })
    );
  });

  it('should allow editor to update content', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'hasAccess').mockResolvedValue(true); // Is editor
    vi.spyOn(mockRepository, 'update').mockResolvedValue(
      ok({ ...mockNote, content: 'New Content' })
    );

    const input = {
      noteId: 'note-1',
      userId: 'editor-1',
      content: 'New Content',
    };

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    expect(mockRepository.hasAccess).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({ value: 'editor-1' }),
      'editor'
    );
    expect(mockRepository.update).toHaveBeenCalledWith('note-1', {
      content: 'New Content',
    });
  });

  it('should deny editor from changing public status', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'hasAccess').mockResolvedValue(true);

    const input = {
      noteId: 'note-1',
      userId: 'editor-1',
      isPublic: true,
    };

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(
        NoteErrors.ownerOnly('change public status')
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
