import type { Editor } from '@tiptap/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useNoteEditorStore } from './note-editor.store';

const editor = { getHTML: () => '<p>a</p>' } as unknown as Editor;

describe('note-editor.store', () => {
  beforeEach(() => {
    useNoteEditorStore.setState({ noteId: null, editor: null, title: '' });
  });

  it('attaches the live editor with its title', () => {
    useNoteEditorStore.getState().attach('n1', editor, 'Uno');
    expect(useNoteEditorStore.getState()).toMatchObject({
      noteId: 'n1',
      editor,
      title: 'Uno',
    });
  });

  it('ignores title and detach calls from a note that is not attached', () => {
    const { attach, setTitle, detach } = useNoteEditorStore.getState();
    attach('n2', editor, 'Dos');
    setTitle('n1', 'stale');
    detach('n1');
    expect(useNoteEditorStore.getState()).toMatchObject({
      noteId: 'n2',
      title: 'Dos',
    });
  });

  it('mirrors the title of the attached note and detaches it', () => {
    const { attach, setTitle, detach } = useNoteEditorStore.getState();
    attach('n1', editor, 'Uno');
    setTitle('n1', 'Uno editado');
    expect(useNoteEditorStore.getState().title).toBe('Uno editado');
    detach('n1');
    expect(useNoteEditorStore.getState()).toMatchObject({
      noteId: null,
      editor: null,
      title: '',
    });
  });
});
