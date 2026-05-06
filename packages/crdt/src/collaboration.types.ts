import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import type {
  BROADCAST_MESSAGE_TYPES,
  BroadcastMessageType,
} from './collaboration.constants';

/**
 * Generic collaboration provider interface
 * Works with both WebRTC and WebSocket providers
 */
export interface CollaborationProvider {
  awareness: Awareness;
  destroy: () => void;
}

/**
 * Represents a user participating in collaborative editing
 * @param id - The user's ID
 * @param name - The user's display name
 * @param color - The user's cursor color (hex color)
 * @param lastSeen - Timestamp of last presence update (optional, used for cleanup)
 */
export interface CollaborativeUser {
  id: string;
  name: string;
  color: string;
  lastSeen?: number;
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
 * Options for the CollaborativeCursors extension
 * @param awareness - The awareness protocol instance
 * @param user - The user participating in collaborative editing
 */
export interface CollaborativeCursorsOptions {
  awareness: Awareness;
  user: Pick<CollaborativeUser, 'name' | 'color'>;
}

/**
 * Context value provided by YjsProvider
 * @param getYDoc - Function to get or create a Y.Doc for a specific note
 * @param getYText - Function to get or create a Y.XmlFragment for note content
 * @param getAwareness - Function to get awareness for a note
 * @param currentUser - The current user information
 * @param activeUsers - The map of active users per note
 * @param broadcastPresence - Function to broadcast user presence to other tabs
 * @param broadcastLeave - Function to broadcast user leaving a note
 * @param clearAwarenessForNote - Function to clear awareness state for a specific note
 */
export interface YjsContextValue {
  getYDoc: (noteId: string) => Y.Doc;
  getYText: (noteId: string) => Y.XmlFragment;
  getAwareness: (noteId: string) => Awareness | null;
  currentUser: CollaborativeUser;
  activeUsers: Map<string, CollaborativeUser[]>;
  broadcastPresence: (noteId: string) => void;
  broadcastLeave: (noteId: string) => void;
  clearAwarenessForNote: (noteId: string) => void;
}

/**
 * Base structure for broadcast messages
 * @param type - The type of broadcast message
 * @param noteId - The ID of the note
 */
interface BaseBroadcastMessage {
  type: BroadcastMessageType;
  noteId: string;
}

/**
 * Awareness update message
 * @param type - The type of broadcast message
 * @param noteId - The ID of the note
 * @param update - The awareness update
 */
export interface AwarenessBroadcastMessage extends BaseBroadcastMessage {
  type: typeof BROADCAST_MESSAGE_TYPES.AWARENESS;
  update: number[];
}

/**
 * Presence update message
 * @param type - The type of broadcast message
 * @param noteId - The ID of the note
 * @param user - The user participating in collaborative editing
 */
export interface PresenceBroadcastMessage extends BaseBroadcastMessage {
  type: typeof BROADCAST_MESSAGE_TYPES.PRESENCE;
  user: CollaborativeUser;
}

/**
 * Document update message
 * @param type - The type of broadcast message
 * @param noteId - The ID of the note
 * @param updates - The document update
 */
export interface DocumentUpdateBroadcastMessage extends BaseBroadcastMessage {
  type: typeof BROADCAST_MESSAGE_TYPES.UPDATE;
  updates: number[];
}

/**
 * User leave message
 * @param type - The type of broadcast message
 * @param noteId - The ID of the note
 * @param user - The user participating in collaborative editing
 */
export interface LeaveBroadcastMessage extends BaseBroadcastMessage {
  type: typeof BROADCAST_MESSAGE_TYPES.LEAVE;
  user: CollaborativeUser;
}

export type BroadcastMessage =
  | AwarenessBroadcastMessage
  | PresenceBroadcastMessage
  | DocumentUpdateBroadcastMessage
  | LeaveBroadcastMessage;
