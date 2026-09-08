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
 * Reasons the API refuses the collaboration handshake. They reach the client's
 * `onAuthenticationFailed` verbatim only when thrown on an error exposing them
 * as `reason` — hocuspocus transmits `error.reason ?? 'permission-denied'` —
 * and the wire can still carry strings outside this catalog (older servers, the
 * provider's own synthesized failures), so consumers must treat an unknown
 * reason as exactly that.
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

/** Document CLOSE carries a reason (the provider synthesizes code 1000). */
export const COLLABORATION_CLOSE_REASON = {
  ACCESS_CHANGED: 'Note access changed',
  ACCESS_UNAVAILABLE: 'Note access unavailable',
  TOKEN_EXPIRED: 'Token expired',
} as const;

export type CollaborationCloseReason =
  (typeof COLLABORATION_CLOSE_REASON)[keyof typeof COLLABORATION_CLOSE_REASON];
