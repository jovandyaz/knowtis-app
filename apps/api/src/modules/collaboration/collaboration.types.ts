import type * as Y from 'yjs';

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

export interface AuthenticatedWsUser {
  type: 'authenticated';
  userId: string;
  email: string;
}

export interface AnonymousWsUser {
  type: 'anonymous';
  odUserId: string;
}

export type WsUser = AuthenticatedWsUser | AnonymousWsUser;

export interface WsAuthResult {
  user: WsUser;
  shareToken?: string;
}

export function getWsUserId(user: WsUser): string {
  return user.type === 'authenticated' ? user.userId : user.odUserId;
}

export function isAuthenticatedWsUser(
  user: WsUser
): user is AuthenticatedWsUser {
  return user.type === 'authenticated';
}

export interface CollaborationRoom {
  noteId: string;
  yjsDoc: Y.Doc;
  users: Map<string, CollaborationUser>;
  lastActivity: Date;
  persistenceTimeout?: NodeJS.Timeout;
}

export const EXTERNAL_UPDATE_ORIGIN = 'external-update' as const;

export const COLLABORATION_EVENTS = {
  JOIN_ROOM: 'collaboration:join',
  LEAVE_ROOM: 'collaboration:leave',
  SYNC_UPDATE: 'collaboration:sync',
  AWARENESS_UPDATE: 'collaboration:awareness',
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

export interface JoinRoomPayload {
  noteId: string;
  user: Omit<CollaborationUser, 'id'>;
}

export interface SyncUpdatePayload {
  noteId: string;
  update: number[];
}

export interface AwarenessUpdatePayload {
  noteId: string;
  update: number[];
}

export interface InitialStateResponse {
  noteId: string;
  state: number[];
  users: CollaborationUser[];
  readOnly: boolean;
}
