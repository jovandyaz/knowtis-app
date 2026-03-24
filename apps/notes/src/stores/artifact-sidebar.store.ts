import { create } from 'zustand';

interface ArtifactSidebarStore {
  open: boolean;
  manuallyToggled: boolean;
  activeNoteId: string | null;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setActiveNoteId: (noteId: string | null) => void;
  autoShow: () => void;
}

export const useArtifactSidebarStore = create<ArtifactSidebarStore>(
  (set, get) => ({
    open: false,
    manuallyToggled: false,
    activeNoteId: null,
    toggle: () =>
      set((state) => ({ open: !state.open, manuallyToggled: true })),
    setOpen: (open) => set({ open, manuallyToggled: true }),
    setActiveNoteId: (noteId) => {
      const current = get().activeNoteId;
      if (noteId !== current) {
        set({ activeNoteId: noteId, manuallyToggled: false });
      }
    },
    autoShow: () => {
      if (!get().manuallyToggled) {
        set({ open: true });
      }
    },
  })
);
