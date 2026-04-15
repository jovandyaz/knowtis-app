import { UserId } from '@jovandyaz/auth/server';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';
import {
  GENERAL_ACCESS,
  PERMISSION,
  type PermissionLevel,
} from '@knowtis/shared-types';

import { NOTE_REPOSITORY } from '../notes/domain';
import type { NoteRepository } from '../notes/domain';
import {
  EXTERNAL_UPDATE_ORIGIN,
  type CollaborationRoom,
  type CollaborationUser,
} from './collaboration.types';

@Injectable()
export class CollaborationService implements OnModuleDestroy {
  private readonly logger = new Logger(CollaborationService.name);
  private readonly rooms = new Map<string, CollaborationRoom>();
  private readonly roomCreationPromises = new Map<
    string,
    Promise<CollaborationRoom>
  >();
  private readonly PERSISTENCE_DEBOUNCE_MS = 2000;
  private readonly ROOM_CLEANUP_TIMEOUT_MS = 60000;

  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notesRepository: NoteRepository
  ) {}

  async getOrCreateRoom(noteId: string): Promise<CollaborationRoom> {
    const existingRoom = this.rooms.get(noteId);
    if (existingRoom) {
      existingRoom.lastActivity = new Date();
      return existingRoom;
    }

    const pendingCreation = this.roomCreationPromises.get(noteId);
    if (pendingCreation) {
      return pendingCreation;
    }

    const creationPromise = this.buildRoom(noteId).finally(() => {
      this.roomCreationPromises.delete(noteId);
    });

    this.roomCreationPromises.set(noteId, creationPromise);
    return creationPromise;
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

  /**
   * Apply an externally-generated Yjs state (e.g. from a REST update) to a
   * live room and return the delta to broadcast. The caller is responsible
   * for the authoritative DB write — this method intentionally does NOT
   * schedule persistence to avoid overwriting the caller's write.
   */
  applyExternalYjsUpdate(
    noteId: string,
    yjsState: Uint8Array
  ): Uint8Array | null {
    const room = this.rooms.get(noteId);
    if (!room) {
      return null;
    }

    const probeDoc = new Y.Doc();
    try {
      Y.applyUpdate(probeDoc, yjsState);
    } catch (error) {
      this.logger.error(
        `Rejected malformed external Yjs state for note ${noteId}`,
        error instanceof Error ? error.stack : error
      );
      probeDoc.destroy();
      return null;
    }
    probeDoc.destroy();

    const oldStateVector = Y.encodeStateVector(room.yjsDoc);

    room.yjsDoc.transact(() => {
      const fragment = room.yjsDoc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
      fragment.delete(0, fragment.length);
      Y.applyUpdate(room.yjsDoc, yjsState, EXTERNAL_UPDATE_ORIGIN);
    }, EXTERNAL_UPDATE_ORIGIN);

    const delta = Y.encodeStateAsUpdate(room.yjsDoc, oldStateVector);

    room.lastActivity = new Date();

    this.logger.debug(
      `Applied external Yjs update to active room ${noteId} (delta ${delta.byteLength}B)`
    );

    return delta;
  }

  async noteExists(noteId: string): Promise<boolean> {
    const note = await this.notesRepository.findById(noteId);
    return note !== null;
  }

  async isNotePublic(noteId: string): Promise<boolean> {
    const note = await this.notesRepository.findById(noteId);
    return note?.generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK;
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
    const note = await this.notesRepository.findById(noteId);
    if (!note) {
      this.logger.debug(`Share token not found: ${token.substring(0, 8)}...`);
      return null;
    }

    if (
      note.generalAccess !== GENERAL_ACCESS.ANYONE_WITH_LINK ||
      note.shareToken !== token
    ) {
      this.logger.debug(`Share token validation failed for note ${noteId}`);
      return null;
    }

    return note.generalAccessPermission as PermissionLevel;
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

  private async buildRoom(noteId: string): Promise<CollaborationRoom> {
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

    const room: CollaborationRoom = {
      noteId,
      yjsDoc,
      users: new Map(),
      lastActivity: new Date(),
    };

    this.rooms.set(noteId, room);
    this.logger.log(`Created collaboration room for note ${noteId}`);

    return room;
  }

  private schedulePersistence(room: CollaborationRoom): void {
    if (room.persistenceTimeout) {
      clearTimeout(room.persistenceTimeout);
    }

    room.persistenceTimeout = setTimeout(() => {
      this.persistDocument(room).catch((error) => {
        this.logger.error(
          `Debounced persistence failed for note ${room.noteId}`,
          error
        );
      });
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
    setTimeout(() => {
      const room = this.rooms.get(noteId);

      if (room && room.users.size === 0) {
        if (room.persistenceTimeout) {
          clearTimeout(room.persistenceTimeout);
        }

        this.persistDocument(room)
          .then(() => {
            room.yjsDoc.destroy();
            this.rooms.delete(noteId);
            this.logger.log(`Cleaned up collaboration room for note ${noteId}`);
          })
          .catch((error) => {
            this.logger.error(
              `Cleanup persistence failed for note ${noteId}`,
              error
            );
            room.yjsDoc.destroy();
            this.rooms.delete(noteId);
          });
      }
    }, this.ROOM_CLEANUP_TIMEOUT_MS);
  }
}
