import type { TokenStorage } from '@jovandyaz/auth-react';

/**
 * Provider used by `@hocuspocus/provider` to obtain a fresh JWT on every
 * (re)connect. Hocuspocus accepts a function returning `string | Promise<string>`
 * and invokes it whenever it needs to authenticate.
 *
 * `setTokenStorage` is wired once at app startup (see `apps/notes/src/auth/setup.ts`)
 * to avoid a circular runtime dependency between the editor and the auth module.
 */
let tokenStorageRef: TokenStorage | null = null;

export function setTokenStorage(storage: TokenStorage): void {
  tokenStorageRef = storage;
}

export function getCollaborationToken(): string {
  return tokenStorageRef?.getAccessToken() ?? '';
}
