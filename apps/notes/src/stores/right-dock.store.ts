import { create } from 'zustand';

export type RightDockTab = 'copilot' | 'estudio';

interface RightDockStore {
  isOpen: boolean;
  activeTab: RightDockTab;
  open: (tab: RightDockTab) => void;
  close: () => void;
  toggle: (tab: RightDockTab) => void;
  setTab: (tab: RightDockTab) => void;
}

export const useRightDockStore = create<RightDockStore>((set, get) => ({
  isOpen: false,
  activeTab: 'copilot',
  open: (tab) => set({ isOpen: true, activeTab: tab }),
  close: () => set({ isOpen: false }),
  toggle: (tab) => {
    const { isOpen, activeTab } = get();
    if (isOpen && activeTab === tab) {
      set({ isOpen: false });
    } else {
      set({ isOpen: true, activeTab: tab });
    }
  },
  setTab: (tab) => set({ activeTab: tab }),
}));
