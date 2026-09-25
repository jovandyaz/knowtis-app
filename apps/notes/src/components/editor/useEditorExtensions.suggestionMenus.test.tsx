import { useState } from 'react';

import { act, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type * as DataAccessNotesModule from '@knowtis/data-access-notes';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { useEditorExtensions } from './useEditorExtensions';

const NOTE_ID = 'note-1';
const USER = { id: 'user-1', name: 'Tester', color: '#000000' };
const EXISTING_TAG = 'projects';
const SLASH_COMMAND = { name: /ai\.slash\.heading1/ };
const TAG_OPTION = { name: EXISTING_TAG };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@knowtis/data-access-notes', async (importOriginal) => ({
  ...(await importOriginal<typeof DataAccessNotesModule>()),
  useTags: () => ({
    data: [{ id: EXISTING_TAG, path: EXISTING_TAG, color: null, noteCount: 1 }],
  }),
  useNote: () => ({ data: { tags: [] } }),
  useUpdateNote: () => ({ mutate: vi.fn() }),
}));

let editor: Editor | null = null;

function NoteEditor({ onCreate }: { onCreate: (created: Editor) => void }) {
  const [doc] = useState(() => new Y.Doc());
  const extensions = useEditorExtensions(
    NOTE_ID,
    doc,
    doc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
    null,
    USER,
    true,
    false
  );
  const current = useEditor({
    extensions,
    onCreate: ({ editor: created }) => onCreate(created),
  });
  return <EditorContent editor={current} />;
}

async function mountNoteEditor(): Promise<Editor> {
  const created = await new Promise<Editor>((resolve) => {
    render(<NoteEditor onCreate={resolve} />);
  });
  editor = created;
  return created;
}

async function type(target: Editor, text: string) {
  await act(async () => {
    target.commands.insertContent(text);
  });
}

describe('the note editor suggestion menus', () => {
  afterEach(async () => {
    await act(async () => {
      editor?.destroy();
    });
    editor = null;
  });

  it('opens the slash command menu when the user types /', async () => {
    await type(await mountNoteEditor(), '/');

    expect(await screen.findByRole('button', SLASH_COMMAND)).toBeVisible();
    expect(screen.queryByRole('button', TAG_OPTION)).toBeNull();
  });

  it('opens the tag menu, not the slash menu, when the user types #', async () => {
    await type(await mountNoteEditor(), '#');

    expect(await screen.findByRole('button', TAG_OPTION)).toBeVisible();
    expect(screen.queryByRole('button', SLASH_COMMAND)).toBeNull();
  });
});
