import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { NoteEntity, NoteErrorCodes, NoteWriteRepository } from '../../domain';
import { NoteCreatedEvent } from '../../domain/events';
import { editorSchema } from '../../infrastructure/html-to-yjs';
import * as htmlToYjsModule from '../../infrastructure/html-to-yjs';
import { CreateNoteHandler } from './create-note.handler';

function decodeYjsBuffer(buf: Buffer) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, buf);
  const node = yXmlFragmentToProseMirrorRootNode(
    doc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
    editorSchema
  );
  doc.destroy();
  return node.toJSON();
}

describe('CreateNoteHandler', () => {
  let handler: CreateNoteHandler;
  let mockRepository: NoteWriteRepository;
  let mockEventEmitter: EventEmitter2;

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      createWithYjsState: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
      updateContentWithYjsState: vi.fn(),
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
    const expectedNote: NoteEntity = {
      id: 'note-1',
      title: input.title,
      content: input.content,
      ownerId: input.ownerId,
      generalAccess: 'restricted',
      generalAccessPermission: 'viewer',
      shareToken: null,
      editorsCanShare: false,
      yjsState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(mockRepository, 'createWithYjsState').mockResolvedValue(
      ok(expectedNote)
    );

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(expectedNote);
    }
    expect(mockRepository.createWithYjsState).toHaveBeenCalledWith(
      {
        title: input.title,
        content: input.content,
        ownerId: expect.objectContaining({ value: input.ownerId }),
      },
      expect.any(Buffer)
    );
    expect(mockRepository.create).not.toHaveBeenCalled();

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

  it('should persist content + yjsState atomically in a single call', async () => {
    const input = {
      title: 'T',
      content: '<p>hi</p>',
      ownerId: 'user-1',
    };
    const expectedNote: NoteEntity = {
      id: 'note-atomic',
      title: input.title,
      content: input.content,
      ownerId: input.ownerId,
      generalAccess: 'restricted',
      generalAccessPermission: 'viewer',
      shareToken: null,
      editorsCanShare: false,
      yjsState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.spyOn(mockRepository, 'createWithYjsState').mockResolvedValue(
      ok(expectedNote)
    );

    await handler.execute(input);

    expect(mockRepository.createWithYjsState).toHaveBeenCalledTimes(1);
    expect(mockRepository.create).not.toHaveBeenCalled();
    expect(mockRepository.updateYjsState).not.toHaveBeenCalled();
    expect(mockRepository.updateContentWithYjsState).not.toHaveBeenCalled();

    const [, bufferArg] = vi.mocked(mockRepository.createWithYjsState).mock
      .calls[0];
    expect(Buffer.isBuffer(bufferArg)).toBe(true);
    expect((bufferArg as Buffer).byteLength).toBeGreaterThan(0);

    const decoded = decodeYjsBuffer(bufferArg as Buffer);
    // Input was '<p>hi</p>' → round-trip should contain 'hi' text
    expect(JSON.stringify(decoded)).toContain('hi');
  });

  it('should return INVALID_CONTENT and not insert when htmlToYjsState throws', async () => {
    vi.spyOn(htmlToYjsModule, 'htmlToYjsState').mockImplementationOnce(() => {
      throw new Error('malformed');
    });

    const result = await handler.execute({
      title: 'T',
      content: '<garbage>',
      ownerId: 'user-1',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.INVALID_CONTENT);
    }
    expect(mockRepository.create).not.toHaveBeenCalled();
    expect(mockRepository.createWithYjsState).not.toHaveBeenCalled();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
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
    expect(mockRepository.createWithYjsState).not.toHaveBeenCalled();
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
    expect(mockRepository.createWithYjsState).not.toHaveBeenCalled();
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
    vi.spyOn(mockRepository, 'createWithYjsState').mockResolvedValue(
      err(expectedError)
    );

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual(expectedError);
    }
  });
});
