import { useEffect, useState } from 'react';

import type { Awareness } from 'y-protocols/awareness';

import type { AwarenessState, CollaborativeUser } from '@knowtis/crdt';

function remoteCollaborators(awareness: Awareness): CollaborativeUser[] {
  const states = awareness.getStates() as Map<number, AwarenessState>;
  const users: CollaborativeUser[] = [];

  states.forEach((state, clientId) => {
    if (clientId === awareness.clientID) {
      return;
    }

    if (state.user?.name && state.user?.color && state.cursor) {
      users.push({
        id: String(clientId),
        name: state.user.name,
        color: state.user.color,
      });
    }
  });

  return users;
}

/** Remote users present on `awareness` (the open connection's), none without one. */
export function useActiveCollaborators(
  awareness: Awareness | null
): CollaborativeUser[] {
  const [collaborators, setCollaborators] = useState<CollaborativeUser[]>([]);

  useEffect(() => {
    if (!awareness) {
      return;
    }

    const updateCollaborators = () =>
      setCollaborators(remoteCollaborators(awareness));

    updateCollaborators();
    awareness.on('change', updateCollaborators);

    return () => {
      awareness.off('change', updateCollaborators);
      setCollaborators([]);
    };
  }, [awareness]);

  return collaborators;
}
