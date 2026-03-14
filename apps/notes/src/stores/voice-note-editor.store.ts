import { create } from 'zustand';

interface VoiceNoteEditorState {
  isOpen: boolean;
  insertPosition: number | null;
  preAcquiredStream: MediaStream | null;
  open: (position: number, stream?: MediaStream) => void;
  close: () => void;
}

export const useVoiceNoteEditorStore = create<VoiceNoteEditorState>(
  (set, get) => ({
    isOpen: false,
    insertPosition: null,
    preAcquiredStream: null,
    open: (position, stream) =>
      set({
        isOpen: true,
        insertPosition: position,
        preAcquiredStream: stream ?? null,
      }),
    close: () => {
      const { preAcquiredStream } = get();
      if (preAcquiredStream) {
        preAcquiredStream.getTracks().forEach((track) => track.stop());
      }
      set({ isOpen: false, insertPosition: null, preAcquiredStream: null });
    },
  })
);
