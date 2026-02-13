import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { CollaborationService } from './collaboration.service';
import {
  COLLABORATION_EVENTS,
  getWsUserId,
  isAuthenticatedWsUser,
  type AwarenessUpdatePayload,
  type CollaborationUser,
  type JoinRoomPayload,
  type SyncUpdatePayload,
  type WsUser,
} from './collaboration.types';
import { WsAuthService } from './ws-auth.service';

interface AuthenticatedSocket extends Socket {
  data: {
    wsUser?: WsUser | undefined;
    shareToken?: string | undefined;
    noteId?: string | undefined;
    user?: CollaborationUser | undefined;
    readOnly?: boolean | undefined;
  };
}

@WebSocketGateway({
  namespace: '/collaboration',
  cors: {
    origin: process.env['FRONTEND_URL'] || 'http://localhost:4200',
    credentials: true,
  },
})
export class CollaborationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CollaborationGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly collaborationService: CollaborationService,
    private readonly wsAuthService: WsAuthService
  ) {}

  afterInit(): void {
    this.logger.log('Collaboration WebSocket Gateway initialized');
  }

  handleConnection(client: AuthenticatedSocket): void {
    const { user: wsUser, shareToken } = this.wsAuthService.extractUser(client);
    client.data.wsUser = wsUser;
    client.data.shareToken = shareToken;

    const userType =
      wsUser.type === 'authenticated'
        ? `authenticated (${wsUser.email})`
        : 'anonymous';
    this.logger.debug(`Client connected: ${client.id} - ${userType}`);
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const { noteId } = client.data;

    if (noteId) {
      const room = this.collaborationService.getRoom(noteId);
      if (room) {
        const user = this.collaborationService.removeUserFromRoom(
          room,
          client.id
        );

        if (user) {
          client.to(noteId).emit(COLLABORATION_EVENTS.USER_LEFT, {
            userId: user.id,
            name: user.name,
          });
        }
      }
    }

    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage(COLLABORATION_EVENTS.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomPayload
  ): Promise<void> {
    const { noteId, user } = payload;
    const wsUser = client.data.wsUser;

    if (!wsUser) {
      client.emit(COLLABORATION_EVENTS.ERROR, {
        message: 'Authentication state not initialized',
        code: 'AUTH_ERROR',
      });
      return;
    }

    const userId = getWsUserId(wsUser);
    const shareToken = client.data.shareToken;

    const accessCheck = await this.verifyNoteAccess(wsUser, noteId, shareToken);
    if (!accessCheck.allowed) {
      client.emit(COLLABORATION_EVENTS.ERROR, {
        message: accessCheck.message,
        code: accessCheck.code,
      });
      return;
    }

    try {
      const room = await this.collaborationService.getOrCreateRoom(noteId);

      const collabUser: CollaborationUser = {
        id: userId,
        name: user.name,
        color: user.color,
      };

      client.data.noteId = noteId;
      client.data.user = collabUser;
      client.data.readOnly = accessCheck.readOnly;

      this.collaborationService.addUserToRoom(room, client.id, collabUser);

      await client.join(noteId);

      const state = this.collaborationService.getDocumentState(room);
      const users = this.collaborationService.getRoomUsers(room);

      client.emit(COLLABORATION_EVENTS.INITIAL_STATE, {
        noteId,
        state: Array.from(state),
        users,
        readOnly: accessCheck.readOnly,
      });

      client.to(noteId).emit(COLLABORATION_EVENTS.USER_JOINED, collabUser);

      const userType = isAuthenticatedWsUser(wsUser)
        ? 'authenticated'
        : 'anonymous';
      this.logger.log(`User ${user.name} (${userType}) joined room ${noteId}`);
    } catch (error) {
      this.logger.error(`Failed to join room ${noteId}`, error);
      client.emit(COLLABORATION_EVENTS.ERROR, {
        message: 'Failed to join collaboration room',
        code: 'JOIN_FAILED',
      });
    }
  }

  private async verifyNoteAccess(
    wsUser: WsUser,
    noteId: string,
    shareToken?: string
  ): Promise<{
    allowed: boolean;
    readOnly: boolean;
    message: string;
    code: string;
  }> {
    const noteExists = await this.collaborationService.noteExists(noteId);

    if (!noteExists) {
      return { allowed: true, readOnly: false, message: '', code: '' };
    }

    if (isAuthenticatedWsUser(wsUser)) {
      const hasAccess = await this.collaborationService.hasAccess(
        noteId,
        wsUser.userId
      );
      if (hasAccess) {
        const canEdit = await this.collaborationService.canEdit(
          noteId,
          wsUser.userId
        );
        return {
          allowed: true,
          readOnly: !canEdit,
          message: '',
          code: '',
        };
      }
    }

    if (shareToken) {
      const permission = await this.collaborationService.validateShareToken(
        shareToken,
        noteId
      );
      if (permission) {
        return {
          allowed: true,
          readOnly: permission === 'viewer',
          message: '',
          code: '',
        };
      }
    }

    const isPublic = await this.collaborationService.isNotePublic(noteId);
    if (isPublic) {
      return { allowed: true, readOnly: true, message: '', code: '' };
    }

    const errorMessage = isAuthenticatedWsUser(wsUser)
      ? 'You do not have access to this note'
      : 'Anonymous users can only access public notes. Please sign in to access this note.';
    const errorCode = isAuthenticatedWsUser(wsUser)
      ? 'ACCESS_DENIED'
      : 'AUTH_REQUIRED';

    return {
      allowed: false,
      readOnly: false,
      message: errorMessage,
      code: errorCode,
    };
  }

  @SubscribeMessage(COLLABORATION_EVENTS.LEAVE_ROOM)
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket
  ): Promise<void> {
    const { noteId, user } = client.data;

    if (!noteId) {
      return;
    }

    const room = this.collaborationService.getRoom(noteId);
    if (room) {
      this.collaborationService.removeUserFromRoom(room, client.id);

      if (user) {
        client.to(noteId).emit(COLLABORATION_EVENTS.USER_LEFT, {
          userId: user.id,
          name: user.name,
        });
      }
    }

    await client.leave(noteId);
    client.data.noteId = undefined;
    client.data.user = undefined;
    client.data.readOnly = undefined;

    this.logger.debug(`User left room ${noteId}`);
  }

  @SubscribeMessage(COLLABORATION_EVENTS.SYNC_UPDATE)
  async handleSyncUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SyncUpdatePayload
  ): Promise<void> {
    const { noteId, update } = payload;

    if (!client.data.wsUser) {
      client.emit(COLLABORATION_EVENTS.ERROR, {
        message: 'Authentication state not initialized',
        code: 'AUTH_ERROR',
      });
      return;
    }

    if (client.data.readOnly) {
      client.emit(COLLABORATION_EVENTS.EDIT_DENIED, {
        message: 'You do not have permission to edit this note',
        code: 'EDIT_DENIED',
      });
      return;
    }

    const room = this.collaborationService.getRoom(noteId);
    if (!room) {
      client.emit(COLLABORATION_EVENTS.ERROR, {
        message: 'Room not found',
        code: 'ROOM_NOT_FOUND',
      });
      return;
    }

    const updateArray = new Uint8Array(update);
    this.collaborationService.applyUpdate(room, updateArray);

    client.to(noteId).emit(COLLABORATION_EVENTS.DOCUMENT_UPDATE, {
      noteId,
      update,
    });
  }

  @SubscribeMessage(COLLABORATION_EVENTS.AWARENESS_UPDATE)
  handleAwarenessUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: AwarenessUpdatePayload
  ): void {
    const { noteId, update } = payload;

    client.to(noteId).emit(COLLABORATION_EVENTS.AWARENESS_CHANGE, {
      noteId,
      update,
    });
  }
}
