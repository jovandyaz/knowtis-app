import { useEffect } from 'react';

import { useAIStore } from '@/stores/ai.store';
import { useRightDockStore } from '@/stores/right-dock.store';

import { useMediaQuery } from '@knowtis/shared-hooks';

export function useCopilotAutoOpen() {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const aiEnabled = useAIStore((s) => s.aiEnabled);
  const hasAutoOpened = useRightDockStore((s) => s.hasAutoOpened);
  const autoOpenOnce = useRightDockStore((s) => s.autoOpenOnce);

  useEffect(() => {
    if (isDesktop && aiEnabled && !hasAutoOpened) {
      autoOpenOnce();
    }
  }, [isDesktop, aiEnabled, hasAutoOpened, autoOpenOnce]);
}
