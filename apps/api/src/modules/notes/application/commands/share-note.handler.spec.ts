import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMAIL_NOT_VERIFIED_CODE, PERMISSION } from '@knowtis/shared-types';

import {
  IDENTITY_STATE,
  policyFor,
  type IdentityState,
} from '../../../../test-support/verified-identity';
import {
  NoteErrorCodes,
  PermissionLevel,
  type NoteEntity,
  type NotePermissionEntity,
  type NoteRepository,
} from '../../domain';
import { ShareNoteHandler, type ShareNoteInput } from './share-note.handler';

const mockNote: NoteEntity = {
  id: 'note-1',
  title: 'Test Note',
  content: 'content',
  ownerId: 'owner-1',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  shareToken: null,
  editorsCanShare: false,
  bucket: null,
  supertag: null,
  supertagFields: null,
  yjsState: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEditorPermissionVO = {
  value: PERMISSION.EDITOR,
  isEditor: () => true,
  toJSON: () => PERMISSION.EDITOR,
};

const mockViewerPermissionVO = {
  value: PERMISSION.VIEWER,
  isEditor: () => false,
  toJSON: () => PERMISSION.VIEWER,
};

const mockPermission: NotePermissionEntity = {
  noteId: 'note-1',
  userId: 'editor-1',
  permission: mockEditorPermissionVO as PermissionLevel,
};

describe('ShareNoteHandler', () => {
  let handler: ShareNoteHandler;
  let noteRepo: NoteRepository;

  beforeEach(() => {
    noteRepo = {
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
    handler = new ShareNoteHandler(
      noteRepo,
      policyFor(IDENTITY_STATE.VERIFIED)
    );
  });

  describe('Owner sharing', () => {
    it('should allow owner to share note', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(mockNote);
      vi.mocked(noteRepo.upsertPermission).mockResolvedValue(
        ok(mockPermission)
      );

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'owner-1',
        targetUserId: 'user-2',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.upsertPermission).toHaveBeenCalledWith({
        noteId: 'note-1',
        userId: expect.any(Object),
        permission: PERMISSION.VIEWER,
      });
    });

    it('should re-grant an existing permission at the new level', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(mockNote);
      vi.mocked(noteRepo.upsertPermission).mockResolvedValue(
        ok({
          ...mockPermission,
          permission: mockViewerPermissionVO as PermissionLevel,
        })
      );

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'owner-1',
        targetUserId: 'editor-1',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.upsertPermission).toHaveBeenCalledWith({
        noteId: 'note-1',
        userId: expect.any(Object),
        permission: PERMISSION.VIEWER,
      });
    });

    it('should not read the target permission before writing it', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(mockNote);
      vi.mocked(noteRepo.upsertPermission).mockResolvedValue(
        ok(mockPermission)
      );

      await handler.execute({
        noteId: 'note-1',
        userId: 'owner-1',
        targetUserId: 'user-2',
        permission: PERMISSION.VIEWER,
      });

      expect(noteRepo.findPermission).not.toHaveBeenCalled();
    });
  });

  describe('Editor sharing when editorsCanShare is true', () => {
    it('should allow editor to share note when editorsCanShare is true', async () => {
      const noteWithEditorsCanShare: NoteEntity = {
        ...mockNote,
        editorsCanShare: true,
      };

      vi.mocked(noteRepo.findById).mockResolvedValue(noteWithEditorsCanShare);
      vi.mocked(noteRepo.findPermission).mockResolvedValue(mockPermission);
      vi.mocked(noteRepo.upsertPermission).mockResolvedValue(
        ok({
          ...mockPermission,
          userId: 'user-3',
        })
      );

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'editor-1',
        targetUserId: 'user-3',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.upsertPermission).toHaveBeenCalled();
      expect(noteRepo.findPermission).toHaveBeenCalledTimes(1);
    });

    it('should allow editor to raise an existing permission when editorsCanShare is true', async () => {
      const noteWithEditorsCanShare: NoteEntity = {
        ...mockNote,
        editorsCanShare: true,
      };

      vi.mocked(noteRepo.findById).mockResolvedValue(noteWithEditorsCanShare);
      vi.mocked(noteRepo.findPermission).mockResolvedValue(mockPermission);
      vi.mocked(noteRepo.upsertPermission).mockResolvedValue(
        ok({
          ...mockPermission,
          userId: 'user-3',
          permission: mockEditorPermissionVO as PermissionLevel,
        })
      );

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'editor-1',
        targetUserId: 'user-3',
        permission: PERMISSION.EDITOR,
      };

      const result = await handler.execute(input);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.upsertPermission).toHaveBeenCalledWith({
        noteId: 'note-1',
        userId: expect.any(Object),
        permission: PERMISSION.EDITOR,
      });
    });
  });

  describe('Editor sharing when editorsCanShare is false', () => {
    it('should deny editor sharing when editorsCanShare is false', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(mockNote);

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'editor-1',
        targetUserId: 'user-3',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
        expect(result.error.message).toContain('Only owner');
      }
    });
  });

  describe('Viewer cannot share', () => {
    it('should deny viewer sharing even when editorsCanShare is true', async () => {
      const noteWithEditorsCanShare: NoteEntity = {
        ...mockNote,
        editorsCanShare: true,
      };

      const viewerPermission: NotePermissionEntity = {
        ...mockPermission,
        permission: mockViewerPermissionVO as PermissionLevel,
      };

      vi.mocked(noteRepo.findById).mockResolvedValue(noteWithEditorsCanShare);
      vi.mocked(noteRepo.findPermission).mockResolvedValue(viewerPermission);

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'viewer-1',
        targetUserId: 'user-3',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
      }
    });
  });

  describe('User without permission cannot share', () => {
    it('should deny sharing when user has no permission', async () => {
      const noteWithEditorsCanShare: NoteEntity = {
        ...mockNote,
        editorsCanShare: true,
      };

      vi.mocked(noteRepo.findById).mockResolvedValue(noteWithEditorsCanShare);
      vi.mocked(noteRepo.findPermission).mockResolvedValue(null);

      const input: ShareNoteInput = {
        noteId: 'note-1',
        userId: 'random-user',
        targetUserId: 'user-3',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(NoteErrorCodes.PERMISSION_DENIED);
      }
    });
  });

  describe('Verified email gate', () => {
    const shareAs = (state: IdentityState) => {
      const gated = new ShareNoteHandler(noteRepo, policyFor(state));
      return gated.execute({
        noteId: 'note-1',
        userId: 'owner-1',
        targetUserId: 'user-2',
        permission: PERMISSION.VIEWER,
      });
    };

    beforeEach(() => {
      vi.mocked(noteRepo.findById).mockResolvedValue(mockNote);
      vi.mocked(noteRepo.upsertPermission).mockResolvedValue(
        ok(mockPermission)
      );
    });

    it('lets an unverified owner share while the gate flag is off', async () => {
      const result = await shareAs(IDENTITY_STATE.GATE_OFF);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.upsertPermission).toHaveBeenCalled();
    });

    it('rejects an unverified owner without reading or writing anything', async () => {
      const result = await shareAs(IDENTITY_STATE.UNVERIFIED);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(EMAIL_NOT_VERIFIED_CODE);
      }
      expect(noteRepo.findById).not.toHaveBeenCalled();
      expect(noteRepo.upsertPermission).not.toHaveBeenCalled();
    });

    it('rejects an anonymous owner without reading or writing anything', async () => {
      const result = await shareAs(IDENTITY_STATE.ANONYMOUS);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(EMAIL_NOT_VERIFIED_CODE);
      }
      expect(noteRepo.findById).not.toHaveBeenCalled();
      expect(noteRepo.upsertPermission).not.toHaveBeenCalled();
    });

    it('lets a verified owner share', async () => {
      const result = await shareAs(IDENTITY_STATE.VERIFIED);

      expect(result.isOk()).toBe(true);
      expect(noteRepo.upsertPermission).toHaveBeenCalled();
    });
  });

  describe('Validation errors', () => {
    it('should fail when note not found', async () => {
      vi.mocked(noteRepo.findById).mockResolvedValue(null);

      const input: ShareNoteInput = {
        noteId: 'non-existent',
        userId: 'owner-1',
        targetUserId: 'user-2',
        permission: PERMISSION.VIEWER,
      };

      const result = await handler.execute(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(NoteErrorCodes.NOTE_NOT_FOUND);
      }
    });
  });
});
