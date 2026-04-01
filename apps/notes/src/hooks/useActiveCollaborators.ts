import { useEffect, useState } from 'react';

import { useYjs } from '@/providers';
import type { AwarenessState, CollaborativeUser } from '@/types';

interface UseActiveCollaboratorsOptions {
  enabled?: boolean;
}

export function useActiveCollaborators(
  noteId: string,
  { enabled = true }: UseActiveCollaboratorsOptions = {}
): CollaborativeUser[] {
  const { getAwareness } = useYjs();
  const [collaborators, setCollaborators] = useState<CollaborativeUser[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const awareness = getAwareness(noteId);
    if (!awareness) {
      return;
    }

    const updateCollaborators = () => {
      const states = awareness.getStates() as Map<number, AwarenessState>;
      const localClientId = awareness.clientID;
      const users: CollaborativeUser[] = [];

      states.forEach((state, clientId) => {
        if (clientId === localClientId) {
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

      setCollaborators(users);
    };

    updateCollaborators();

    awareness.on('change', updateCollaborators);

    return () => {
      awareness.off('change', updateCollaborators);
    };
  }, [noteId, getAwareness, enabled]);

  return collaborators;
}
