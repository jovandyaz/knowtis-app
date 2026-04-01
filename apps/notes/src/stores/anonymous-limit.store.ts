import { create } from 'zustand';

interface AnonymousLimitStore {
  showModal: boolean;
  openModal: () => void;
  closeModal: () => void;
}

export const useAnonymousLimitStore = create<AnonymousLimitStore>((set) => ({
  showModal: false,
  openModal: () => set({ showModal: true }),
  closeModal: () => set({ showModal: false }),
}));
