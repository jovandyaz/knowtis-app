import type { AnyExtension } from '@tiptap/core';
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
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';

import { MermaidBlockNode } from './mermaid-block-node';

export interface NodeAttributeClasses {
  readonly bulletList?: string;
  readonly orderedList?: string;
  readonly listItem?: string;
  readonly blockquote?: string;
  readonly table?: string;
}

export interface SemanticExtensionsOptions {
  readonly openLinksOnClick?: boolean;
  readonly disableHistory?: boolean;
  readonly classes?: NodeAttributeClasses;
}

function buildStarterKitConfig(options: SemanticExtensionsOptions) {
  const classes = options.classes ?? {};

  return {
    codeBlock: false as const,
    ...(options.disableHistory && { undoRedo: false as const }),
    heading: { levels: [1, 2, 3] as (1 | 2 | 3)[] },
    ...(classes.bulletList && {
      bulletList: { HTMLAttributes: { class: classes.bulletList } },
    }),
    ...(classes.orderedList && {
      orderedList: { HTMLAttributes: { class: classes.orderedList } },
    }),
    ...(classes.listItem && {
      listItem: { HTMLAttributes: { class: classes.listItem } },
    }),
    ...(classes.blockquote && {
      blockquote: { HTMLAttributes: { class: classes.blockquote } },
    }),
    link: {
      openOnClick: options.openLinksOnClick ?? false,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    },
  };
}

/**
 * Builds the shared set of Tiptap extensions that define the collaborative
 * document schema. The schema itself is style-agnostic: pass `classes` only
 * when a consumer needs to decorate rendered HTML (e.g. the frontend editor).
 * Backend consumers (HTML → Yjs conversion) should omit `classes` to keep
 * the persisted HTML free of app-specific styling.
 */
export function createSemanticExtensions(
  options: SemanticExtensionsOptions = {}
): readonly AnyExtension[] {
  const lowlight = createLowlight(common);
  const tableClass = options.classes?.table;

  return [
    StarterKit.configure(buildStarterKitConfig(options)),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: null,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({
      resizable: false,
      ...(tableClass && { HTMLAttributes: { class: tableClass } }),
    }),
    TableRow,
    TableHeader,
    TableCell,
    Superscript,
    Subscript,
    Highlight.configure({ multicolor: true }),
    MermaidBlockNode,
  ];
}
