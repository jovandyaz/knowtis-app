import { create } from 'zustand';

interface ArtifactSidebarStore {
  activeNoteId: string | null;
  generatorOpen: boolean;
  setActiveNoteId: (noteId: string | null) => void;
  openGenerator: () => void;
  closeGenerator: () => void;
}

export const useArtifactSidebarStore = create<ArtifactSidebarStore>((set) => ({
  activeNoteId: null,
  generatorOpen: false,
  setActiveNoteId: (noteId) => set({ activeNoteId: noteId }),
  openGenerator: () => set({ generatorOpen: true }),
  closeGenerator: () => set({ generatorOpen: false }),
}));
