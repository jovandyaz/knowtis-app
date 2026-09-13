import type { Editor } from '@tiptap/react';
import { create } from 'zustand';

interface NoteEditorState {
  noteId: string | null;
  editor: Editor | null;
  title: string;
  attach: (noteId: string, editor: Editor, title: string) => void;
  setTitle: (noteId: string, title: string) => void;
  detach: (noteId: string) => void;
}

/**
 * The live editor of the note open in the workspace, for readers outside the
 * editor tree (the copilot's before/after review). Read-only by convention:
 * writing through it would bypass the page's save and collaboration flow.
 */
export const useNoteEditorStore = create<NoteEditorState>((set, get) => ({
  noteId: null,
  editor: null,
  title: '',
  attach: (noteId, editor, title) => set({ noteId, editor, title }),
  setTitle: (noteId, title) => {
    if (get().noteId === noteId) {
      set({ title });
    }
  },
  detach: (noteId) => {
    if (get().noteId === noteId) {
      set({ noteId: null, editor: null, title: '' });
    }
  },
}));
