import type { ReactNode } from 'react';

import type { IndexeddbPersistence } from 'y-indexeddb';
import type * as Y from 'yjs';

/**
 * Yjs provider props interface
 * @property {ReactNode} children - The content to display in the yjs provider
 */
export interface YjsProviderProps {
  children: ReactNode;
}

/**
 * Document resources interface
 * @property {Map<string, Y.Doc>} docs - The map of documents
 * @property {Map<string, IndexeddbPersistence>} persistence - The map of persistence
 */
export interface DocumentResources {
  docs: Map<string, Y.Doc>;
  persistence: Map<string, IndexeddbPersistence>;
}
