import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { generateJSON } from '@tiptap/html/server';
import { Schema } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';

const lowlight = createLowlight(common);

/**
 * ProseMirror schema matching the frontend TipTap editor's extension set.
 * Must stay in sync with apps/notes/src/components/editor/extensions/base-extensions.ts
 */
export const editorSchema = new Schema({
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
    codeBlock: {
      content: 'text*',
      group: 'block',
      code: true,
      attrs: { language: { default: null } },
    },
    horizontalRule: { group: 'block' },
    hardBreak: { inline: true, group: 'inline' },
    bulletList: { content: 'listItem+', group: 'block' },
    orderedList: {
      content: 'listItem+',
      group: 'block',
      attrs: { start: { default: 1 } },
    },
    listItem: { content: 'paragraph block*' },
    taskList: { content: 'taskItem+', group: 'block' },
    taskItem: {
      content: 'paragraph block*',
      defining: true,
      attrs: { checked: { default: false } },
    },
    table: {
      content: 'tableRow+',
      group: 'block',
      tableRole: 'table',
      isolating: true,
    },
    tableRow: {
      content: '(tableCell | tableHeader)*',
      tableRole: 'row',
    },
    tableCell: {
      content: 'block+',
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
      },
      tableRole: 'cell',
      isolating: true,
    },
    tableHeader: {
      content: 'block+',
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
      },
      tableRole: 'header_cell',
      isolating: true,
    },
  },
  marks: {
    bold: {},
    italic: {},
    underline: {},
    code: {},
    strike: {},
    superscript: {},
    subscript: {},
    highlight: {
      attrs: { color: { default: null } },
    },
    link: {
      attrs: {
        href: { default: null },
        target: { default: '_blank' },
        rel: { default: 'noopener noreferrer' },
      },
    },
  },
});

const tiptapExtensions = [
  StarterKit.configure({ codeBlock: false }),
  CodeBlockLowlight.configure({ lowlight }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Superscript,
  Subscript,
  Highlight.configure({ multicolor: true }),
];

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
