import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { safeLocalStorage } from '@knowtis/shared-util';

import { clampWidth, readPersistedWidth } from './persisted-width';

const DOCK_DEFAULT_WIDTH = 500;
export const DOCK_MIN_WIDTH = 300;
export const DOCK_MAX_WIDTH = 720;

const DOCK_WIDTH_BOUNDS = {
  min: DOCK_MIN_WIDTH,
  max: DOCK_MAX_WIDTH,
  fallback: DOCK_DEFAULT_WIDTH,
};

interface DockPreferenceStore {
  /** The width the user resized the dock to — persisted across sessions. */
  preferredWidth: number;
  setPreferredWidth: (width: number) => void;
}

function readPersistedDockWidth(persistedState: unknown): number {
  const value =
    typeof persistedState === 'object' &&
    persistedState !== null &&
    'preferredWidth' in persistedState
      ? persistedState.preferredWidth
      : undefined;

  return readPersistedWidth(value, DOCK_WIDTH_BOUNDS);
}

export const useDockPreferenceStore = create<DockPreferenceStore>()(
  persist(
    (set) => ({
      preferredWidth: DOCK_DEFAULT_WIDTH,
      setPreferredWidth: (width) => {
        const preferredWidth = clampWidth(width, DOCK_WIDTH_BOUNDS);
        if (preferredWidth === undefined) {
          return;
        }
        set({ preferredWidth });
      },
    }),
    {
      name: 'notes-dock',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({ preferredWidth: s.preferredWidth }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        preferredWidth: readPersistedDockWidth(persistedState),
      }),
    }
  )
);
