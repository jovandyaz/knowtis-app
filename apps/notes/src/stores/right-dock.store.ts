import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { safeLocalStorage } from '@knowtis/shared-util';

export const DOCK_FOCUS_TARGETS = ['composer'] as const;

export type DockFocusTarget = (typeof DOCK_FOCUS_TARGETS)[number];

interface RightDockStore {
  isOpen: boolean;
  hasAutoOpened: boolean;
  /** What takes the focus once the dock shows it; whoever takes it clears it. Session-only. */
  focusTarget: DockFocusTarget | null;
  open: (focusTarget?: DockFocusTarget) => void;
  close: () => void;
  clearFocusTarget: () => void;
  toggle: () => void;
  autoOpenOnce: () => void;
  /** The copilot is showing a proposal review instead of the chat. Session-only. */
  reviewOpen: boolean;
  openReview: () => void;
  closeReview: () => void;
}

export const useRightDockStore = create<RightDockStore>()(
  persist(
    (set, get) => ({
      isOpen: false,
      hasAutoOpened: false,
      focusTarget: null,
      open: (focusTarget) =>
        set({ isOpen: true, focusTarget: focusTarget ?? null }),
      close: () => set({ isOpen: false, focusTarget: null }),
      clearFocusTarget: () => set({ focusTarget: null }),
      toggle: () =>
        set(
          get().isOpen ? { isOpen: false, focusTarget: null } : { isOpen: true }
        ),
      autoOpenOnce: () => {
        if (!get().hasAutoOpened) {
          set({ isOpen: true, hasAutoOpened: true });
        }
      },
      reviewOpen: false,
      openReview: () => set({ reviewOpen: true }),
      closeReview: () => set({ reviewOpen: false }),
    }),
    {
      name: 'right-dock',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        isOpen: s.isOpen,
        hasAutoOpened: s.hasAutoOpened,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          typeof persistedState === 'object' && persistedState !== null
            ? persistedState
            : {};
        const merged = { ...currentState, ...persisted };
        if (merged.isOpen && !window.matchMedia('(min-width: 768px)').matches) {
          return { ...merged, isOpen: false };
        }
        return merged;
      },
    }
  )
);
