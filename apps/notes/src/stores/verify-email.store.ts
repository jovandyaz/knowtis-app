import { create } from 'zustand';

interface VerifyEmailStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * Drives the one verification dialog mounted in the app shell, so any gated
 * action can offer verification in place without owning a dialog of its own.
 */
export const useVerifyEmailStore = create<VerifyEmailStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
