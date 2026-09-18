import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SIDEBAR_DEFAULT_WIDTH = 272;
export const SIDEBAR_MIN_WIDTH = 224;
export const SIDEBAR_MAX_WIDTH = 360;

interface SidebarPreferenceStore {
  /** The width the user resized the sidebar to — persisted across sessions. */
  preferredWidth: number;
  setPreferredWidth: (width: number) => void;
}

function readPersistedWidth(persistedState: unknown): number {
  const value =
    typeof persistedState === 'object' &&
    persistedState !== null &&
    'preferredWidth' in persistedState
      ? persistedState.preferredWidth
      : undefined;

  const isUsable =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= SIDEBAR_MIN_WIDTH &&
    value <= SIDEBAR_MAX_WIDTH;

  return isUsable ? value : SIDEBAR_DEFAULT_WIDTH;
}

export const useSidebarPreferenceStore = create<SidebarPreferenceStore>()(
  persist(
    (set) => ({
      preferredWidth: SIDEBAR_DEFAULT_WIDTH,
      setPreferredWidth: (preferredWidth) => set({ preferredWidth }),
    }),
    {
      name: 'notes-sidebar',
      partialize: (s) => ({ preferredWidth: s.preferredWidth }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        preferredWidth: readPersistedWidth(persistedState),
      }),
    }
  )
);
