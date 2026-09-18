import { create } from 'zustand';

interface SidebarStore {
  collapsed: boolean;
  /** Preferred width while open, 0 while collapsed; set in a layout effect before the slide animation. */
  visibleWidth: number;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setVisibleWidth: (visibleWidth: number) => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  collapsed: false,
  visibleWidth: 0,
  toggle: () => set((state) => ({ collapsed: !state.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed }),
  setVisibleWidth: (visibleWidth) => set({ visibleWidth }),
}));
