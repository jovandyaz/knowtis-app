import * as Y from 'yjs';

import { logger } from '@knowtis/shared-util';

import {
  generateUserName,
  getInstanceId,
  getRandomCursorColor,
} from './collaboration';
import { BROADCAST_MESSAGE_TYPES } from './collaboration.constants';
import type {
  BroadcastMessage,
  CollaborativeUser,
} from './collaboration.types';
import type { DocumentResources } from './YjsProvider.types';

/**
 * Creates this tab's collaborative identity
 */
export function createInitialUser(): CollaborativeUser {
  const id = getInstanceId();
  return {
    id,
    name: generateUserName(id),
    color: getRandomCursorColor(),
  };
}

function isBroadcastMessage(data: unknown): data is BroadcastMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    data.type === BROADCAST_MESSAGE_TYPES.UPDATE &&
    'noteId' in data &&
    typeof data.noteId === 'string' &&
    'updates' in data &&
    Array.isArray(data.updates)
  );
}

/**
 * Applies the document updates other tabs post on the broadcast channel and
 * ignores any other message, such as one from a tab on an older build
 */
export function createMessageHandler(resources: DocumentResources) {
  return (event: MessageEvent<unknown>) => {
    try {
      const message = event.data;
      if (!isBroadcastMessage(message)) {
        return;
      }

      const doc = resources.docs.get(message.noteId);
      if (doc) {
        Y.applyUpdate(doc, new Uint8Array(message.updates));
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
  resources.docs.forEach((doc) => doc.destroy());
  resources.persistence.forEach((persistence) => persistence.destroy());
}
