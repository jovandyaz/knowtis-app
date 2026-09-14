import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RightDockStore {
  isOpen: boolean;
  hasAutoOpened: boolean;
  open: () => void;
  close: () => void;
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
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set({ isOpen: !get().isOpen }),
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
