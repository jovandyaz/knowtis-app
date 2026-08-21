import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

import {
  NoteEntity,
  NoteErrorCodes,
  NoteErrors,
  NoteRepository,
  TagRepository,
} from '../../domain';
import { NoteUpdatedEvent } from '../../domain/events';
import * as htmlToYjsModule from '../../infrastructure/html-to-yjs';
import { UpdateNoteHandler } from './update-note.handler';

const clientStateFor = (html: string): Buffer =>
  htmlToYjsModule.htmlToYjsState(html);

const mockNote: NoteEntity = {
  id: 'note-1',
  title: 'Original Title',
  content: 'Original Content',
  ownerId: 'owner-1',
  generalAccess: GENERAL_ACCESS.RESTRICTED,
  generalAccessPermission: PERMISSION.VIEWER,
  shareToken: null,
  editorsCanShare: false,
  bucket: null,
  supertag: null,
  supertagFields: null,
  yjsState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const noteId = mockNote.id;
const OWNER_ID = mockNote.ownerId;
const EDITOR_ID = 'editor-1';

describe('UpdateNoteHandler', () => {
  let handler: UpdateNoteHandler;
  let mockRepository: NoteRepository;
  let mockTagRepository: TagRepository;
  let mockEventEmitter: EventEmitter2;

  beforeEach(() => {
    mockRepository = {
      findById: vi.fn(),
      findByIdWithOwner: vi.fn(),
      findByOwner: vi.fn(),
      findAccessibleByUser: vi.fn(),
      findByShareToken: vi.fn(),
      findByIdForUser: vi.fn(),
      findAccessibleSummariesByUser: vi.fn(),
      findAccessibleNotesByLexicalRank: vi.fn(),
      findAccessibleNotesByEmbedding: vi.fn(),
      countAccessibleByUser: vi.fn(),
      countAccessibleByBucket: vi.fn(),
      countAccessibleBySupertag: vi.fn(),
      create: vi.fn(),
      createWithYjsState: vi.fn(),
      update: vi.fn(),
      updateYjsState: vi.fn(),
      updateContentWithYjsState: vi.fn(),
      delete: vi.fn(),
      restore: vi.fn(),
      findPermission: vi.fn(),
      findPermissionsByNote: vi.fn(),
      upsertPermission: vi.fn(),
      deletePermission: vi.fn(),
      hasAccess: vi.fn(),
    };

    mockEventEmitter = {
      emit: vi.fn(),
    } as unknown as EventEmitter2;

    mockTagRepository = {
      findTreeByOwner: vi.fn(),
      findById: vi.fn(),
      ensurePaths: vi.fn().mockResolvedValue([]),
      replaceNoteTags: vi.fn(),
      findPathsByNotes: vi.fn(),
      renameBranch: vi.fn(),
      recolor: vi.fn(),
      deleteBranch: vi.fn(),
    };

    handler = new UpdateNoteHandler(
      mockRepository,
      mockTagRepository,
      mockEventEmitter
    );
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

  it('should preserve the share token when changing to restricted', async () => {
    const noteWithToken: NoteEntity = {
      ...mockNote,
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
      shareToken: 'existing-token-abc123',
    };

    vi.spyOn(mockRepository, 'findById').mockResolvedValue(noteWithToken);
    const updateSpy = vi
      .spyOn(mockRepository, 'update')
      .mockResolvedValue(ok(noteWithToken));

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    });

    expect(result.isOk()).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({ generalAccess: GENERAL_ACCESS.RESTRICTED })
    );
    expect(updateSpy.mock.calls[0]?.[1]).not.toHaveProperty('shareToken');
  });

  it('should reuse the existing token when sharing is re-enabled', async () => {
    const restrictedNoteWithToken: NoteEntity = {
      ...mockNote,
      generalAccess: GENERAL_ACCESS.RESTRICTED,
      shareToken: 'existing-token-abc123',
    };

    vi.spyOn(mockRepository, 'findById').mockResolvedValue(
      restrictedNoteWithToken
    );
    const updateSpy = vi
      .spyOn(mockRepository, 'update')
      .mockResolvedValue(ok(restrictedNoteWithToken));

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
    });

    expect(result.isOk()).toBe(true);
    expect(updateSpy.mock.calls[0]?.[1]).not.toHaveProperty('shareToken');
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

  // The client state is stored verbatim: regenerating from HTML here would
  // mint a second CRDT history and duplicate the note on reload.
  it('should store the client CRDT state with the content instead of regenerating from HTML', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'updateContentWithYjsState').mockResolvedValue(
      ok({ ...mockNote, content: '<p>Editor content</p>' })
    );
    const clientState = clientStateFor('<p>Editor content</p>');
    const htmlSpy = vi.spyOn(htmlToYjsModule, 'htmlToYjsState');

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<p>Editor content</p>',
      yjsState: clientState.toString('base64'),
    });

    expect(result.isOk()).toBe(true);
    expect(htmlSpy).not.toHaveBeenCalled();
    const [, dataArg, bufferArg] = vi.mocked(
      mockRepository.updateContentWithYjsState
    ).mock.calls[0];
    expect(dataArg).toEqual({ content: '<p>Editor content</p>' });
    expect(Buffer.compare(bufferArg as Buffer, clientState)).toBe(0);

    // Broadcasting it back would clear and refill the sender's own document.
    const emitted = vi.mocked(mockEventEmitter.emit).mock
      .calls[0]?.[1] as NoteUpdatedEvent;
    expect(emitted.yjsState).toBeUndefined();
  });

  // A fresh mint would leave any client holding the old history to merge two
  // parallel copies of the same text.
  it('evolves the existing CRDT history on a server-side content write', async () => {
    const existing = clientStateFor('<p>Original</p>');
    vi.spyOn(mockRepository, 'findById').mockResolvedValue({
      ...mockNote,
      yjsState: existing,
    });
    vi.spyOn(mockRepository, 'updateContentWithYjsState').mockResolvedValue(
      ok({ ...mockNote, content: '<p>Rewritten by the copilot</p>' })
    );

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<p>Rewritten by the copilot</p>',
    });

    expect(result.isOk()).toBe(true);
    const [, , bufferArg] = vi.mocked(mockRepository.updateContentWithYjsState)
      .mock.calls[0];

    // The stored state carries the original history forward instead of
    // replacing it, and renders only the new text.
    const merged = new Y.Doc();
    Y.applyUpdate(merged, new Uint8Array(bufferArg as Buffer));
    const html = htmlToYjsModule.yDocToHtml(merged);
    merged.destroy();
    expect(html).toContain('Rewritten by the copilot');
    expect(html).not.toContain('Original');

    const replayed = new Y.Doc();
    Y.applyUpdate(replayed, new Uint8Array(existing));
    Y.applyUpdate(replayed, new Uint8Array(bufferArg as Buffer));
    const replayedHtml = htmlToYjsModule.yDocToHtml(replayed);
    replayed.destroy();
    expect(replayedHtml).toBe(html);
  });

  it('should reject a yjsState sent without content', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      title: 'Just a rename',
      yjsState: clientStateFor('<p>orphan</p>').toString('base64'),
    });

    expect(result.isErr()).toBe(true);
    expect(mockRepository.update).not.toHaveBeenCalled();
    expect(mockRepository.updateContentWithYjsState).not.toHaveBeenCalled();
  });

  // A pre-rollout bundle cannot send CRDT state, but leaving yjs_state unset
  // is what let those notes duplicate in the first place. The flag now only
  // suppresses the broadcast; the state is still kept coherent.
  it('keeps CRDT state coherent for a pre-rollout bundle without echoing it back', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'updateContentWithYjsState').mockResolvedValue(
      ok({ ...mockNote, content: '<p>Old tab</p>' })
    );

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<p>Old tab</p>',
      skipYjsState: true,
    });

    expect(result.isOk()).toBe(true);
    const [, , bufferArg] = vi.mocked(mockRepository.updateContentWithYjsState)
      .mock.calls[0];
    expect(Buffer.isBuffer(bufferArg)).toBe(true);
    expect((bufferArg as Buffer).byteLength).toBeGreaterThan(0);

    const emitted = vi.mocked(mockEventEmitter.emit).mock
      .calls[0]?.[1] as NoteUpdatedEvent;
    expect(emitted.yjsState).toBeUndefined();
  });

  it('should reject bytes that are not a Yjs update', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<p>ok</p>',
      yjsState: Buffer.from('definitely not a yjs update').toString('base64'),
    });

    expect(result.isErr()).toBe(true);
    expect(mockRepository.updateContentWithYjsState).not.toHaveBeenCalled();
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
      content: '<p>real content</p>',
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

  it('should refuse to overwrite non-trivial content with trivial HTML', async () => {
    const existingContent = '<h1>Real content</h1><p>Many lines</p>';
    vi.spyOn(mockRepository, 'findById').mockResolvedValue({
      ...mockNote,
      content: existingContent,
    });

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<p></p>',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.CONTENT_OVERWRITE_REFUSED);
    }
    expect(mockRepository.updateContentWithYjsState).not.toHaveBeenCalled();
    expect(mockRepository.update).not.toHaveBeenCalled();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should allow trivial overwrite when force flag is set', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue({
      ...mockNote,
      content: '<h1>Real</h1>',
    });
    vi.spyOn(mockRepository, 'updateContentWithYjsState').mockResolvedValue(
      ok({ ...mockNote, content: '<p></p>' })
    );

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<p></p>',
      force: true,
    });

    expect(result.isOk()).toBe(true);
    expect(mockRepository.updateContentWithYjsState).toHaveBeenCalled();
  });

  it('should allow trivial-to-trivial writes (no-op safe)', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue({
      ...mockNote,
      content: '<p></p>',
    });
    vi.spyOn(mockRepository, 'updateContentWithYjsState').mockResolvedValue(
      ok(mockNote)
    );

    const result = await handler.execute({
      noteId: 'note-1',
      userId: 'owner-1',
      content: '<p></p>',
    });

    expect(result.isOk()).toBe(true);
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

  it('owner sets a bucket', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'update').mockResolvedValue(
      ok({ ...mockNote, bucket: 'projects' })
    );

    const result = await handler.execute({
      noteId,
      userId: OWNER_ID,
      bucket: 'projects',
    });

    expect(result.isOk()).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(
      noteId,
      expect.objectContaining({ bucket: 'projects' })
    );
  });

  it('owner clears the bucket back to Inbox with null', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue({
      ...mockNote,
      bucket: 'projects',
      supertag: null,
      supertagFields: null,
    });
    vi.spyOn(mockRepository, 'update').mockResolvedValue(ok(mockNote));

    const result = await handler.execute({
      noteId,
      userId: OWNER_ID,
      bucket: null,
    });

    expect(result.isOk()).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(
      noteId,
      expect.objectContaining({ bucket: null })
    );
  });

  it('owner assigning a type persists it with the normalized field blob', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'update').mockResolvedValue(ok(mockNote));

    const result = await handler.execute({
      noteId,
      userId: OWNER_ID,
      supertag: 'person',
      supertagFields: { name: 'Ada' },
    });

    expect(result.isOk()).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(
      noteId,
      expect.objectContaining({
        supertag: 'person',
        supertagFields: { name: 'Ada', role: null, contact: null },
      })
    );
  });

  it('owner clearing the type clears its fields in the same write', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue({
      ...mockNote,
      supertag: 'person',
      supertagFields: { name: 'Ada', role: null, contact: null },
    });
    vi.spyOn(mockRepository, 'update').mockResolvedValue(ok(mockNote));

    const result = await handler.execute({
      noteId,
      userId: OWNER_ID,
      supertag: null,
    });

    expect(result.isOk()).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(
      noteId,
      expect.objectContaining({ supertag: null, supertagFields: null })
    );
  });

  it('rejects a type whose required field is missing, before touching the row', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);

    const result = await handler.execute({
      noteId,
      userId: OWNER_ID,
      title: 'Also renamed',
      supertag: 'person',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.INVALID_SUPERTAG);
    }
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('rejects fields sent without the type they belong to', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);

    const result = await handler.execute({
      noteId,
      userId: OWNER_ID,
      supertagFields: { name: 'Ada' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.INVALID_SUPERTAG);
    }
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('editor setting a type is rejected with PERMISSION_DENIED', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'hasAccess').mockResolvedValue(true);

    const result = await handler.execute({
      noteId,
      userId: EDITOR_ID,
      supertag: 'person',
      supertagFields: { name: 'Ada' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
    }
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('editor setting a bucket is rejected with PERMISSION_DENIED', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'hasAccess').mockResolvedValue(true);

    const result = await handler.execute({
      noteId,
      userId: EDITOR_ID,
      bucket: 'areas',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
    }
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('editor editing title only is unaffected', async () => {
    vi.spyOn(mockRepository, 'findById').mockResolvedValue(mockNote);
    vi.spyOn(mockRepository, 'hasAccess').mockResolvedValue(true);
    vi.spyOn(mockRepository, 'update').mockResolvedValue(
      ok({ ...mockNote, title: 'ok' })
    );

    const result = await handler.execute({
      noteId,
      userId: EDITOR_ID,
      title: 'ok',
    });

    expect(result.isOk()).toBe(true);
  });
});
