import type { AwarenessState } from './collaboration.types';
import type { RemoteUserState } from './cursor-decorations.types';

/**
 * Filters and maps awareness states to remote user states
 * @param states - Map of all awareness states from Yjs
 * @param localClientId - The local user's client ID to exclude
 * @returns Array of remote user states with cursor information
 */
export function getRemoteUserStates(
  states: Map<number, AwarenessState>,
  localClientId: number
): RemoteUserState[] {
  const remoteStates: RemoteUserState[] = [];

  states.forEach((state, clientId) => {
    if (clientId === localClientId) {
      return;
    }

    const { user, cursor } = state;

    if (!user || !cursor) {
      return;
    }

    remoteStates.push({ clientId, user, cursor });
  });

  return remoteStates;
}
