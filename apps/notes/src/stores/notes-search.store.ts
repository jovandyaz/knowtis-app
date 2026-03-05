import { create } from 'zustand';

interface NotesSearchStore {
  query: string;
  setQuery: (query: string) => void;
  focusRequested: boolean;
  requestFocus: () => void;
  clearFocusRequest: () => void;
}

export const useNotesSearchStore = create<NotesSearchStore>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
  focusRequested: false,
  requestFocus: () => set({ focusRequested: true }),
  clearFocusRequest: () => set({ focusRequested: false }),
}));
