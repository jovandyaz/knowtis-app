import { useContext } from 'react';

import type { YjsContextValue } from './collaboration.types';
import { YjsContext } from './YjsContext';

/**
 * Hook to access Yjs collaboration features
 * @throws Error if used outside YjsProvider
 */
export function useYjs(): YjsContextValue {
  const context = useContext(YjsContext);

  if (!context) {
    throw new Error('useYjs must be used within a YjsProvider');
  }

  return context;
}
