import { create } from 'zustand';

export type WorkspaceTab = 'note' | 'estudio';

interface WorkspaceStore {
  activeTab: WorkspaceTab;
  setTab: (tab: WorkspaceTab) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeTab: 'note',
  setTab: (tab) => set({ activeTab: tab }),
}));
