import Collaboration from '@tiptap/extension-collaboration';
import { Editor } from '@tiptap/react';
import { vi } from 'vitest';
import * as Y from 'yjs';

import { createBaseExtensions } from '@knowtis/editor';
import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

const NO_COORDS = { top: 0, bottom: 0, left: 0, right: 0 };

export function createCollaborativeEditor(content: string): {
  editor: Editor;
  doc: Y.Doc;
} {
  const doc = new Y.Doc();
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      ...createBaseExtensions({ disableHistory: true }),
      Collaboration.configure({ document: doc, field: YJS_XML_FRAGMENT_NAME }),
    ],
  });
  editor.commands.setContent(content);
  vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue(NO_COORDS);
  return { editor, doc };
}
