import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

import { CollaborationGateway } from './collaboration.gateway';
import { CollaborationService } from './collaboration.service';
import {
  COLLABORATION_EVENTS,
  type AnonymousWsUser,
  type AuthenticatedWsUser,
  type WsAuthResult,
} from './collaboration.types';
import { WsAuthService } from './ws-auth.service';

function createMockSocket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    data: {},
    emit: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    handshake: { auth: {}, headers: {}, query: {} },
    ...overrides,
  } as unknown as Parameters<CollaborationGateway['handleConnection']>[0];
}

function createMockCollaborationService(): Record<
  string,
  ReturnType<typeof vi.fn>
> {
  return {
    noteExists: vi.fn().mockResolvedValue(true),
    hasAccess: vi.fn().mockResolvedValue(false),
    canEdit: vi.fn().mockResolvedValue(false),
    isNotePublic: vi.fn().mockResolvedValue(false),
    validateShareToken: vi.fn().mockResolvedValue(null),
    getOrCreateRoom: vi.fn().mockResolvedValue({
      noteId: 'note-1',
      users: new Map(),
      lastActivity: new Date(),
    }),
    addUserToRoom: vi.fn(),
    getDocumentState: vi.fn().mockReturnValue(new Uint8Array(0)),
    getRoomUsers: vi.fn().mockReturnValue([]),
    getRoom: vi.fn().mockReturnValue({
      noteId: 'note-1',
      users: new Map(),
      lastActivity: new Date(),
    }),
    removeUserFromRoom: vi.fn(),
    applyUpdate: vi.fn(),
  };
}

const ownerUser: AuthenticatedWsUser = {
  type: 'authenticated',
  userId: 'owner-1',
  email: 'owner@test.com',
};

const anonymousUser: AnonymousWsUser = {
  type: 'anonymous',
  odUserId: 'anon-socket-1',
};

const joinPayload = {
  noteId: 'note-1',
  user: { name: 'Test User', color: '#ff0000' },
};

describe('CollaborationGateway', () => {
  let gateway: CollaborationGateway;
  let mockService: Record<string, ReturnType<typeof vi.fn>>;
  let mockWsAuthService: { extractUser: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockService = createMockCollaborationService();
    mockWsAuthService = {
      extractUser: vi.fn(),
    };

    gateway = new CollaborationGateway(
      mockService as unknown as CollaborationService,
      mockWsAuthService as unknown as WsAuthService
    );
  });

  describe('handleConnection', () => {
    it('should store wsUser and shareToken from auth result', () => {
      const authResult: WsAuthResult = {
        user: ownerUser,
        shareToken: 'token-abc',
      };
      mockWsAuthService.extractUser.mockReturnValue(authResult);

      const client = createMockSocket();
      gateway.handleConnection(client);

      expect(client.data.wsUser).toBe(ownerUser);
      expect(client.data.shareToken).toBe('token-abc');
    });

    it('should handle connection without shareToken', () => {
      const authResult: WsAuthResult = {
        user: anonymousUser,
      };
      mockWsAuthService.extractUser.mockReturnValue(authResult);

      const client = createMockSocket();
      gateway.handleConnection(client);

      expect(client.data.wsUser).toBe(anonymousUser);
      expect(client.data.shareToken).toBeUndefined();
    });
  });

  describe('handleJoinRoom', () => {
    it('owner joins — allowed, readOnly=false', async () => {
      const client = createMockSocket();
      client.data.wsUser = ownerUser;

      mockService.hasAccess.mockResolvedValue(true);
      mockService.canEdit.mockResolvedValue(true);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(false);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: false })
      );
    });

    it('editor (direct share) joins — allowed, readOnly=false', async () => {
      const editorUser: AuthenticatedWsUser = {
        type: 'authenticated',
        userId: 'editor-1',
        email: 'editor@test.com',
      };
      const client = createMockSocket();
      client.data.wsUser = editorUser;

      mockService.hasAccess.mockResolvedValue(true);
      mockService.canEdit.mockResolvedValue(true);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(false);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: false })
      );
    });

    it('viewer (direct share) joins — allowed, readOnly=true', async () => {
      const viewerUser: AuthenticatedWsUser = {
        type: 'authenticated',
        userId: 'viewer-1',
        email: 'viewer@test.com',
      };
      const client = createMockSocket();
      client.data.wsUser = viewerUser;

      mockService.hasAccess.mockResolvedValue(true);
      mockService.canEdit.mockResolvedValue(false);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(true);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: true })
      );
    });

    it('share link editor joins — allowed, readOnly=false', async () => {
      const client = createMockSocket();
      client.data.wsUser = anonymousUser;
      client.data.shareToken = 'editor-token';

      mockService.validateShareToken.mockResolvedValue(PERMISSION.EDITOR);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(false);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: false })
      );
      expect(mockService.validateShareToken).toHaveBeenCalledWith(
        'editor-token',
        'note-1'
      );
    });

    it('share link viewer joins — allowed, readOnly=true', async () => {
      const client = createMockSocket();
      client.data.wsUser = anonymousUser;
      client.data.shareToken = 'viewer-token';

      mockService.validateShareToken.mockResolvedValue(PERMISSION.VIEWER);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(true);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: true })
      );
    });

    it('share link for different note — denied', async () => {
      const client = createMockSocket();
      client.data.wsUser = anonymousUser;
      client.data.shareToken = 'wrong-note-token';

      mockService.validateShareToken.mockResolvedValue(null);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.ERROR,
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.data.readOnly).toBeUndefined();
    });

    it('expired share link — denied', async () => {
      const client = createMockSocket();
      client.data.wsUser = anonymousUser;
      client.data.shareToken = 'expired-token';

      mockService.validateShareToken.mockResolvedValue(null);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.ERROR,
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
    });

    it('no permission anonymous — denied (private note)', async () => {
      const client = createMockSocket();
      client.data.wsUser = anonymousUser;

      mockService.isNotePublic.mockResolvedValue(false);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.ERROR,
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
    });

    it('anonymous + public note — allowed, readOnly=true', async () => {
      const client = createMockSocket();
      client.data.wsUser = anonymousUser;

      mockService.isNotePublic.mockResolvedValue(true);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(true);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: true })
      );
    });

    it('authenticated user without direct access on public note — allowed, readOnly=true', async () => {
      const authUser: AuthenticatedWsUser = {
        type: 'authenticated',
        userId: 'other-user',
        email: 'other@test.com',
      };
      const client = createMockSocket();
      client.data.wsUser = authUser;

      mockService.hasAccess.mockResolvedValue(false);
      mockService.isNotePublic.mockResolvedValue(true);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(true);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: true })
      );
    });

    it('authenticated user without direct access but with valid share token — allowed', async () => {
      const authUser: AuthenticatedWsUser = {
        type: 'authenticated',
        userId: 'other-user',
        email: 'other@test.com',
      };
      const client = createMockSocket();
      client.data.wsUser = authUser;
      client.data.shareToken = 'editor-token';

      mockService.hasAccess.mockResolvedValue(false);
      mockService.validateShareToken.mockResolvedValue(PERMISSION.EDITOR);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(false);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: false })
      );
    });

    it('should emit error when wsUser is not initialized', async () => {
      const client = createMockSocket();

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.ERROR,
        expect.objectContaining({ code: 'AUTH_ERROR' })
      );
    });

    it('transient note (not in DB) — allowed, readOnly=false', async () => {
      const client = createMockSocket();
      client.data.wsUser = anonymousUser;

      mockService.noteExists.mockResolvedValue(false);

      await gateway.handleJoinRoom(client, joinPayload);

      expect(client.data.readOnly).toBe(false);
      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.INITIAL_STATE,
        expect.objectContaining({ readOnly: false })
      );
    });
  });

  describe('handleSyncUpdate', () => {
    const syncPayload = {
      noteId: 'note-1',
      update: [1, 2, 3],
    };

    it('viewer sends SYNC_UPDATE — rejected with EDIT_DENIED', async () => {
      const client = createMockSocket();
      client.data.wsUser = anonymousUser;
      client.data.readOnly = true;

      await gateway.handleSyncUpdate(client, syncPayload);

      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.EDIT_DENIED,
        expect.objectContaining({
          code: 'EDIT_DENIED',
          message: 'You do not have permission to edit this note',
        })
      );
      expect(mockService.applyUpdate).not.toHaveBeenCalled();
    });

    it('editor sends SYNC_UPDATE — accepted', async () => {
      const client = createMockSocket();
      client.data.wsUser = ownerUser;
      client.data.readOnly = false;

      await gateway.handleSyncUpdate(client, syncPayload);

      expect(mockService.applyUpdate).toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith(
        COLLABORATION_EVENTS.EDIT_DENIED,
        expect.anything()
      );
    });

    it('should reject when wsUser is not initialized', async () => {
      const client = createMockSocket();

      await gateway.handleSyncUpdate(client, syncPayload);

      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.ERROR,
        expect.objectContaining({ code: 'AUTH_ERROR' })
      );
      expect(mockService.applyUpdate).not.toHaveBeenCalled();
    });

    it('should reject when room not found', async () => {
      const client = createMockSocket();
      client.data.wsUser = ownerUser;
      client.data.readOnly = false;

      mockService.getRoom.mockReturnValue(undefined);

      await gateway.handleSyncUpdate(client, syncPayload);

      expect(client.emit).toHaveBeenCalledWith(
        COLLABORATION_EVENTS.ERROR,
        expect.objectContaining({ code: 'ROOM_NOT_FOUND' })
      );
    });
  });

  describe('validateShareToken (via CollaborationService)', () => {
    it('valid token with matching noteId returns permission', async () => {
      const mockNote = {
        id: 'note-1',
        title: 'Test Note',
        content: '',
        ownerId: 'owner-1',
        generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
        generalAccessPermission: PERMISSION.VIEWER,
        shareToken: 'valid-token',
        editorsCanShare: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockNoteRepo = {
        findById: vi.fn().mockResolvedValue(mockNote),
        findByIdWithOwner: vi.fn(),
        findByOwner: vi.fn(),
        findAccessibleByUser: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        updateYjsState: vi.fn(),
        findPermission: vi.fn(),
        findPermissionsByNote: vi.fn(),
        createPermission: vi.fn(),
        updatePermission: vi.fn(),
        deletePermission: vi.fn(),
        hasAccess: vi.fn(),
      };

      const service = new CollaborationService(mockNoteRepo as never);

      const result = await service.validateShareToken('valid-token', 'note-1');
      expect(result).toBe(PERMISSION.VIEWER);
    });

    it('token mismatch returns null', async () => {
      const mockNote = {
        id: 'note-1',
        title: 'Test Note',
        content: '',
        ownerId: 'owner-1',
        generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
        generalAccessPermission: PERMISSION.VIEWER,
        shareToken: 'different-token',
        editorsCanShare: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockNoteRepo = {
        findById: vi.fn().mockResolvedValue(mockNote),
      };

      const service = new CollaborationService(mockNoteRepo as never);

      const result = await service.validateShareToken('valid-token', 'note-1');
      expect(result).toBeNull();
    });

    it('restricted access returns null', async () => {
      const mockNote = {
        id: 'note-1',
        title: 'Test Note',
        content: '',
        ownerId: 'owner-1',
        generalAccess: GENERAL_ACCESS.RESTRICTED,
        generalAccessPermission: PERMISSION.VIEWER,
        shareToken: 'valid-token',
        editorsCanShare: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockNoteRepo = {
        findById: vi.fn().mockResolvedValue(mockNote),
      };

      const service = new CollaborationService(mockNoteRepo as never);

      const result = await service.validateShareToken('valid-token', 'note-1');
      expect(result).toBeNull();
    });

    it('non-existent note returns null', async () => {
      const mockNoteRepo = {
        findById: vi.fn().mockResolvedValue(null),
      };

      const service = new CollaborationService(mockNoteRepo as never);

      const result = await service.validateShareToken(
        'nonexistent-token',
        'note-1'
      );
      expect(result).toBeNull();
    });
  });
});
