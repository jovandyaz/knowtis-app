/**
 * WebSocket collaboration events
 * Shared between frontend and backend
 */
export const COLLABORATION_EVENTS = {
  // Client -> Server
  JOIN_ROOM: 'collaboration:join',
  LEAVE_ROOM: 'collaboration:leave',
  SYNC_UPDATE: 'collaboration:sync',
  AWARENESS_UPDATE: 'collaboration:awareness',

  // Server -> Client
  INITIAL_STATE: 'collaboration:initial-state',
  DOCUMENT_UPDATE: 'collaboration:update',
  USER_JOINED: 'collaboration:user-joined',
  USER_LEFT: 'collaboration:user-left',
  AWARENESS_CHANGE: 'collaboration:awareness-change',
  EDIT_DENIED: 'collaboration:edit-denied',
  ERROR: 'collaboration:error',
} as const;

export type CollaborationEventType =
  (typeof COLLABORATION_EVENTS)[keyof typeof COLLABORATION_EVENTS];

/**
 * User in a collaborative session
 */
export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

/**
 * Payload for joining a room
 */
export interface JoinRoomPayload {
  noteId: string;
  user: Omit<CollaborationUser, 'id'>;
}

/**
 * Payload for document sync updates
 */
export interface SyncUpdatePayload {
  noteId: string;
  update: number[];
}

/**
 * Payload for awareness updates
 */
export interface AwarenessUpdatePayload {
  noteId: string;
  update: number[];
}

/**
 * Response for initial state on joining
 */
export interface InitialStateResponse {
  noteId: string;
  state: number[];
  users: CollaborationUser[];
}

/**
 * Error response from collaboration server
 */
export interface CollaborationError {
  message: string;
  code: 'ACCESS_DENIED' | 'EDIT_DENIED' | 'ROOM_NOT_FOUND' | 'JOIN_FAILED';
}

/**
 * User joined event payload
 */
export type UserJoinedPayload = CollaborationUser;

/**
 * User left event payload
 */
export interface UserLeftPayload {
  userId: string;
  name: string;
}

/**
 * Reasons the collaboration handshake can be refused. Hocuspocus delivers the
 * message thrown by `onAuthenticate` to the client verbatim as `reason`, so
 * both sides must agree on these strings exactly.
 */
export const HANDSHAKE_FAILURE = {
  AUTH_REQUIRED: 'Authentication required',
  INVALID_TOKEN: 'Invalid token',
  FORBIDDEN: 'Forbidden',
  NOTE_NOT_FOUND: 'Note not found',
  INTERNAL_ERROR: 'Internal server error',
} as const;

export type HandshakeFailureReason =
  (typeof HANDSHAKE_FAILURE)[keyof typeof HANDSHAKE_FAILURE];

/**
 * The reasons a token refresh can repair. Every other reason describes the note
 * or the server, so a new token cannot change the answer.
 */
export const CREDENTIAL_HANDSHAKE_FAILURES: ReadonlySet<string> = new Set([
  HANDSHAKE_FAILURE.AUTH_REQUIRED,
  HANDSHAKE_FAILURE.INVALID_TOKEN,
]);
