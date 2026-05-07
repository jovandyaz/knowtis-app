import { createContext } from 'react';

import type { YjsContextValue } from './collaboration.types';

export const YjsContext = createContext<YjsContextValue | null>(null);
