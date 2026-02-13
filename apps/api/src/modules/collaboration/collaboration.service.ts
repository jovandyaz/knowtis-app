import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';

import { PERMISSION, type PermissionLevel } from '@knowtis/shared-types';

import { UserId } from '../auth/domain';
import { NOTE_REPOSITORY, SHARE_LINK_REPOSITORY } from '../notes/domain';
import type { NoteRepository, ShareLinkRepository } from '../notes/domain';
import type {
  CollaborationRoom,
  CollaborationUser,
} from './collaboration.types';

@Injectable()
export class CollaborationService {
  private readonly logger = new Logger(CollaborationService.name);
  private readonly rooms = new Map<string, CollaborationRoom>();
  private readonly PERSISTENCE_DEBOUNCE_MS = 2000;
  private readonly ROOM_CLEANUP_TIMEOUT_MS = 60000;

  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notesRepository: NoteRepository,
    @Inject(SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepository: ShareLinkRepository
  ) {}

  async getOrCreateRoom(noteId: string): Promise<CollaborationRoom> {
    let room = this.rooms.get(noteId);

    if (!room) {
      const yjsDoc = new Y.Doc();

      try {
        const note = await this.notesRepository.findById(noteId);
        if (note?.yjsState) {
          Y.applyUpdate(yjsDoc, new Uint8Array(note.yjsState));
          this.logger.debug(`Loaded persisted state for note ${noteId}`);
        }
      } catch {
        this.logger.warn(
          `Could not load note ${noteId} from DB, creating transient room`
        );
      }

      room = {
        noteId,
        yjsDoc,
        users: new Map(),
        lastActivity: new Date(),
      };

      this.rooms.set(noteId, room);
      this.logger.log(`Created collaboration room for note ${noteId}`);
    }

    room.lastActivity = new Date();
    return room;
  }

  addUserToRoom(
    room: CollaborationRoom,
    socketId: string,
    user: CollaborationUser
  ): void {
    room.users.set(socketId, user);
    room.lastActivity = new Date();
    this.logger.debug(`User ${user.name} joined room ${room.noteId}`);
  }

  removeUserFromRoom(
    room: CollaborationRoom,
    socketId: string
  ): CollaborationUser | undefined {
    const user = room.users.get(socketId);
    room.users.delete(socketId);
    room.lastActivity = new Date();

    if (user) {
      this.logger.debug(`User ${user.name} left room ${room.noteId}`);
    }

    if (room.users.size === 0) {
      this.scheduleRoomCleanup(room.noteId);
    }

    return user;
  }

  applyUpdate(room: CollaborationRoom, update: Uint8Array): void {
    Y.applyUpdate(room.yjsDoc, update);
    room.lastActivity = new Date();
    this.schedulePersistence(room);
  }

  getDocumentState(room: CollaborationRoom): Uint8Array {
    return Y.encodeStateAsUpdate(room.yjsDoc);
  }

  getRoomUsers(room: CollaborationRoom): CollaborationUser[] {
    return Array.from(room.users.values());
  }

  getRoom(noteId: string): CollaborationRoom | undefined {
    return this.rooms.get(noteId);
  }

  async noteExists(noteId: string): Promise<boolean> {
    const note = await this.notesRepository.findById(noteId);
    return note !== null;
  }

  async isNotePublic(noteId: string): Promise<boolean> {
    const note = await this.notesRepository.findById(noteId);
    return note?.isPublic ?? false;
  }

  async hasAccess(noteId: string, userId: string): Promise<boolean> {
    const userIdResult = UserId.create(userId);
    if (userIdResult.isErr()) {
      return false;
    }
    return this.notesRepository.hasAccess(noteId, userIdResult.value);
  }

  async canEdit(noteId: string, userId: string): Promise<boolean> {
    const note = await this.notesRepository.findById(noteId);
    if (!note) {
      return false;
    }

    if (note.ownerId === userId) {
      return true;
    }

    const userIdResult = UserId.create(userId);
    if (userIdResult.isErr()) {
      return false;
    }
    return this.notesRepository.hasAccess(
      noteId,
      userIdResult.value,
      PERMISSION.EDITOR
    );
  }

  async validateShareToken(
    token: string,
    noteId: string
  ): Promise<PermissionLevel | null> {
    const shareLink = await this.shareLinkRepository.findByToken(token);

    if (!shareLink) {
      this.logger.debug(`Share token not found: ${token.substring(0, 8)}...`);
      return null;
    }

    if (shareLink.noteId !== noteId) {
      this.logger.debug(
        `Share token note mismatch: expected ${noteId}, got ${shareLink.noteId}`
      );
      return null;
    }

    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      this.logger.debug(
        `Share token expired at ${shareLink.expiresAt.toISOString()}`
      );
      return null;
    }

    return shareLink.permission.value;
  }

  private schedulePersistence(room: CollaborationRoom): void {
    if (room.persistenceTimeout) {
      clearTimeout(room.persistenceTimeout);
    }

    room.persistenceTimeout = setTimeout(async () => {
      await this.persistDocument(room);
    }, this.PERSISTENCE_DEBOUNCE_MS);
  }

  private async persistDocument(room: CollaborationRoom): Promise<void> {
    try {
      const state = Y.encodeStateAsUpdate(room.yjsDoc);
      await this.notesRepository.updateYjsState(
        room.noteId,
        Buffer.from(state)
      );
      this.logger.debug(`Persisted document state for note ${room.noteId}`);
    } catch (error) {
      this.logger.error(
        `Failed to persist document state for note ${room.noteId}`,
        error
      );
    }
  }

  private scheduleRoomCleanup(noteId: string): void {
    setTimeout(async () => {
      const room = this.rooms.get(noteId);

      if (room && room.users.size === 0) {
        if (room.persistenceTimeout) {
          clearTimeout(room.persistenceTimeout);
        }
        await this.persistDocument(room);

        room.yjsDoc.destroy();
        this.rooms.delete(noteId);
        this.logger.log(`Cleaned up collaboration room for note ${noteId}`);
      }
    }, this.ROOM_CLEANUP_TIMEOUT_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log(
      'Shutting down collaboration service, persisting all rooms...'
    );

    const persistPromises = Array.from(this.rooms.values()).map(
      async (room) => {
        if (room.persistenceTimeout) {
          clearTimeout(room.persistenceTimeout);
        }
        await this.persistDocument(room);
        room.yjsDoc.destroy();
      }
    );

    await Promise.all(persistPromises);
    this.rooms.clear();
    this.logger.log('Collaboration service shutdown complete');
  }
}
