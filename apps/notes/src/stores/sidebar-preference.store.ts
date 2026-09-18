import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { clampWidth, readPersistedWidth } from './persisted-width';

const SIDEBAR_DEFAULT_WIDTH = 272;
export const SIDEBAR_MIN_WIDTH = 224;
export const SIDEBAR_MAX_WIDTH = 360;

const SIDEBAR_WIDTH_BOUNDS = {
  min: SIDEBAR_MIN_WIDTH,
  max: SIDEBAR_MAX_WIDTH,
  fallback: SIDEBAR_DEFAULT_WIDTH,
};

interface SidebarPreferenceStore {
  /** The width the user resized the sidebar to — persisted across sessions. */
  preferredWidth: number;
  setPreferredWidth: (width: number) => void;
}

function readPersistedSidebarWidth(persistedState: unknown): number {
  const value =
    typeof persistedState === 'object' &&
    persistedState !== null &&
    'preferredWidth' in persistedState
      ? persistedState.preferredWidth
      : undefined;

  return readPersistedWidth(value, SIDEBAR_WIDTH_BOUNDS);
}

export const useSidebarPreferenceStore = create<SidebarPreferenceStore>()(
  persist(
    (set) => ({
      preferredWidth: SIDEBAR_DEFAULT_WIDTH,
      setPreferredWidth: (width) => {
        const preferredWidth = clampWidth(width, SIDEBAR_WIDTH_BOUNDS);
        if (preferredWidth === undefined) {
          return;
        }
        set({ preferredWidth });
      },
    }),
    {
      name: 'notes-sidebar',
      partialize: (s) => ({ preferredWidth: s.preferredWidth }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        preferredWidth: readPersistedSidebarWidth(persistedState),
      }),
    }
  )
);
