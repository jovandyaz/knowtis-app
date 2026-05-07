import * as Y from 'yjs';

import { logger } from '@knowtis/shared-util';

import {
  generateUserName,
  getInstanceId,
  getRandomCursorColor,
} from './collaboration';
import {
  BROADCAST_MESSAGE_TYPES,
  COLLAB_CONFIG,
} from './collaboration.constants';
import type {
  BroadcastMessage,
  CollaborativeUser,
} from './collaboration.types';
import type { DocumentResources } from './YjsProvider.types';

/**
 * Creates initial user state from localStorage or generates new one
 */
export function createInitialUser(): CollaborativeUser {
  const id = getInstanceId();
  return {
    id,
    name: generateUserName(id),
    color: getRandomCursorColor(),
  };
}

/**
 * Generates a unique room name for a note
 */
export function getRoomName(noteId: string): string {
  return `${COLLAB_CONFIG.ROOM_PREFIX}-${noteId}`;
}

/**
 * Handles incoming broadcast messages and updates state accordingly
 */
export function createMessageHandler(
  resources: DocumentResources,
  setActiveUsers: React.Dispatch<
    React.SetStateAction<Map<string, CollaborativeUser[]>>
  >
) {
  return (event: MessageEvent<BroadcastMessage>) => {
    try {
      const message = event.data;
      const { type, noteId } = message;

      switch (type) {
        case BROADCAST_MESSAGE_TYPES.PRESENCE: {
          setActiveUsers((prev) => {
            const newMap = new Map(prev);
            const noteUsers = [...(newMap.get(noteId) || [])];
            const existingIndex = noteUsers.findIndex(
              (u) => u.id === message.user.id
            );

            const userWithTimestamp = {
              ...message.user,
              lastSeen: Date.now(),
            };

            if (existingIndex >= 0) {
              noteUsers[existingIndex] = userWithTimestamp;
            } else {
              noteUsers.push(userWithTimestamp);
            }

            newMap.set(noteId, noteUsers);
            return newMap;
          });
          break;
        }

        case BROADCAST_MESSAGE_TYPES.UPDATE: {
          const doc = resources.docs.get(noteId);
          if (doc && message.updates) {
            Y.applyUpdate(doc, new Uint8Array(message.updates));
          }
          break;
        }

        case BROADCAST_MESSAGE_TYPES.LEAVE: {
          setActiveUsers((prev) => {
            const newMap = new Map(prev);
            const noteUsers = (newMap.get(noteId) || []).filter(
              (u) => u.id !== message.user.id
            );
            newMap.set(noteId, noteUsers);
            return newMap;
          });
          break;
        }
      }
    } catch (error) {
      logger.error('Error handling collaboration message', {
        error,
        context: 'YjsProvider',
      });
    }
  };
}

export function cleanupResources(resources: DocumentResources): void {
  resources.awareness.forEach((awareness) => awareness.destroy());
  resources.docs.forEach((doc) => doc.destroy());
  resources.persistence.forEach((persistence) => persistence.destroy());
}
