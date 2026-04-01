let preloaded = false;

export function preloadEditorChunk() {
  if (!preloaded) {
    preloaded = true;
    import('@/pages/NoteEditorPage');
  }
}
