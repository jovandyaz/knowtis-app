import { create } from 'zustand';

interface SidebarStore {
  collapsed: boolean;
  width: number;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setWidth: (width: number) => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  collapsed: false,
  width: 0,
  toggle: () => set((state) => ({ collapsed: !state.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed }),
  setWidth: (width) => set({ width }),
}));
