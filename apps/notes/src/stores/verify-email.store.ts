import { create } from 'zustand';

/**
 * Where the open request came from. A link click is the one case the user
 * expected to be verified by already, so the dialog owes them an explanation.
 */
export type VerifyEmailPromptSource = 'inApp' | 'emailLink';

interface VerifyEmailStore {
  isOpen: boolean;
  source: VerifyEmailPromptSource;
  open: (source: VerifyEmailPromptSource) => void;
  close: () => void;
}

/**
 * Drives the one verification dialog mounted in the app shell, so any gated
 * action can offer verification in place without owning a dialog of its own.
 */
export const useVerifyEmailStore = create<VerifyEmailStore>((set) => ({
  isOpen: false,
  source: 'inApp',
  open: (source) => set({ isOpen: true, source }),
  close: () => set({ isOpen: false }),
}));
