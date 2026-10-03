import type * as Y from 'yjs';

import type { BROADCAST_MESSAGE_TYPES } from './collaboration.constants';

/**
 * Represents a user participating in collaborative editing
 * @param id - The user's ID
 * @param name - The user's display name
 * @param color - The user's cursor color (hex color)
 */
export interface CollaborativeUser {
  id: string;
  name: string;
  color: string;
}

/**
 * Cursor position in the document
 * @param anchor - The anchor position of the cursor
 * @param head - The head position of the cursor
 */
export interface CursorPosition {
  anchor: number;
  head: number;
}

/**
 * Awareness state for a collaborative user
 * @param user - The user participating in collaborative editing
 * @param cursor - The cursor position in the document
 */
export interface AwarenessState {
  user?: CollaborativeUser;
  cursor?: CursorPosition;
}

/**
 * Context value provided by YjsProvider
 * @param getYDoc - Function to get or create a Y.Doc for a specific note
 * @param getYText - Function to get or create a Y.XmlFragment for note content
 * @param currentUser - The current user information
 */
export interface YjsContextValue {
  getYDoc: (noteId: string) => Y.Doc;
  getYText: (noteId: string) => Y.XmlFragment;
  currentUser: CollaborativeUser;
}

/**
 * Document update relayed to the note's doc in the other tabs of this browser
 * @param type - The type of broadcast message
 * @param noteId - The ID of the note
 * @param updates - The document update
 */
export interface BroadcastMessage {
  type: typeof BROADCAST_MESSAGE_TYPES.UPDATE;
  noteId: string;
  updates: number[];
}
