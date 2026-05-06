import type { CursorPosition } from './collaboration.types';

/**
 * User information for cursor display
 * @param name - The user's display name
 * @param color - The user's cursor color (hex color)
 */
export interface UserInfo {
  name: string;
  color: string;
}

/**
 * Remote user state including cursor position
 * @param clientId - The client ID from Yjs awareness
 * @param user - User information
 * @param cursor - Cursor position in document
 */
export interface RemoteUserState {
  clientId: number;
  user: UserInfo;
  cursor: CursorPosition;
}
