import { useCallback, useRef, useState } from 'react';

export interface ShareActionLock {
  pending: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}

export function useShareActionLock(): ShareActionLock {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) {
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      locked.current = false;
      setPending(false);
    }
  }, []);
  return { pending, run };
}
