import { generateJSON } from '@tiptap/html/server';
import { Schema } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';

/**
 * ProseMirror schema matching the frontend TipTap editor's StarterKit config.
 * Must stay in sync with apps/notes/src/components/editor/useEditorExtensions.ts
 */
const editorSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    text: { group: 'inline' },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
    },
    blockquote: { content: 'block+', group: 'block' },
    codeBlock: { content: 'text*', group: 'block', code: true },
    horizontalRule: { group: 'block' },
    hardBreak: { inline: true, group: 'inline' },
    bulletList: { content: 'listItem+', group: 'block' },
    orderedList: {
      content: 'listItem+',
      group: 'block',
      attrs: { start: { default: 1 } },
    },
    listItem: { content: 'paragraph block*' },
  },
  marks: {
    bold: {},
    italic: {},
    code: {},
    strike: {},
  },
});

const tiptapExtensions = [StarterKit];

/**
 * Converts HTML content to a Yjs binary state (Uint8Array) compatible with
 * the TipTap collaborative editor.
 *
 * Pipeline: HTML → ProseMirror JSON → Y.Doc → binary state
 */
export function htmlToYjsState(html: string): Buffer {
  const json = generateJSON(html, tiptapExtensions);
  const yDoc = prosemirrorJSONToYDoc(editorSchema, json, 'content');
  const state = Y.encodeStateAsUpdate(yDoc);
  yDoc.destroy();
  return Buffer.from(state);
}
