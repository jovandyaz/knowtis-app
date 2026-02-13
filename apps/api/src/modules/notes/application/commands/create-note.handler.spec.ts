import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteEntity, NoteErrorCodes, NoteWriteRepository } from '../../domain';
import { NoteCreatedEvent } from '../../domain/events';
import { CreateNoteHandler } from './create-note.handler';

describe('CreateNoteHandler', () => {
  let handler: CreateNoteHandler;
  let mockRepository: NoteWriteRepository;
  let mockEventEmitter: EventEmitter2;

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
      delete: vi.fn(),
    };

    mockEventEmitter = {
      emit: vi.fn(),
    } as unknown as EventEmitter2;

    handler = new CreateNoteHandler(mockRepository, mockEventEmitter);
  });

  it('should create a note successfully and emit event', async () => {
    const input = {
      title: 'Valid Title',
      content: 'Valid content',
      ownerId: 'user-123',
    };
    // ... expectedNote setup ...
    const expectedNote: NoteEntity = {
      id: 'note-1',
      title: input.title,
      content: input.content,
      ownerId: input.ownerId,
      isPublic: false,
      yjsState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(mockRepository, 'create').mockResolvedValue(ok(expectedNote));

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(expectedNote);
    }
    expect(mockRepository.create).toHaveBeenCalledWith({
      title: input.title,
      content: input.content,
      ownerId: expect.objectContaining({ value: input.ownerId }),
    });

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      NoteCreatedEvent.EVENT_NAME,
      expect.any(NoteCreatedEvent)
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      NoteCreatedEvent.EVENT_NAME,
      expect.objectContaining({
        aggregateId: expectedNote.id,
        title: expectedNote.title,
        ownerId: expectedNote.ownerId,
      })
    );
  });

  it('should fail if title is invalid', async () => {
    const input = {
      title: '', // Invalid
      content: 'Valid content',
      ownerId: 'user-123',
    };

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('should fail if ownerId is invalid', async () => {
    const input = {
      title: 'Valid Title',
      content: 'Valid content',
      ownerId: '', // Invalid
    };

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('should fail if repository fails', async () => {
    const input = {
      title: 'Valid Title',
      content: 'Valid content',
      ownerId: 'user-123',
    };

    const expectedError = {
      code: NoteErrorCodes.INTERNAL_ERROR,
      message: 'DB Error',
    };
    vi.spyOn(mockRepository, 'create').mockResolvedValue(err(expectedError));

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(expectedError);
    }
  });
});
