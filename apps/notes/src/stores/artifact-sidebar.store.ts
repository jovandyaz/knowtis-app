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
  // The generator belongs to one note, so leaving that note ends its dialog;
  // otherwise it stays open and greets the next note already unfolded.
  setActiveNoteId: (noteId) =>
    set({ activeNoteId: noteId, generatorOpen: false }),
  openGenerator: () => set({ generatorOpen: true }),
  closeGenerator: () => set({ generatorOpen: false }),
}));
