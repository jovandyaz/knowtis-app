import { renderHook } from '@testing-library/react';
import { getSchema, type AnyExtension } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  createSemanticExtensions,
  YJS_XML_FRAGMENT_NAME,
} from '@knowtis/editor-schema';

import { useEditorExtensions } from './useEditorExtensions';

const STORED_NODE_TYPES = [
  'aiBlock',
  'blockquote',
  'bulletList',
  'codeBlock',
  'doc',
  'hardBreak',
  'heading',
  'horizontalRule',
  'image',
  'listItem',
  'mermaidBlock',
  'orderedList',
  'paragraph',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
  'taskItem',
  'taskList',
  'text',
];

const STORED_MARK_TYPES = [
  'bold',
  'code',
  'highlight',
  'italic',
  'link',
  'strike',
  'subscript',
  'superscript',
  'underline',
];

function collaborativeEditorExtensions(): AnyExtension[] {
  const doc = new Y.Doc();
  const { result } = renderHook(() =>
    useEditorExtensions(
      'note-1',
      doc,
      doc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
      null,
      { id: 'user-1', name: 'Tester', color: '#000000' },
      true
    )
  );
  return result.current;
}

function persistedTypes(extensions: readonly AnyExtension[]) {
  const schema = getSchema([...extensions]);
  return {
    nodes: Object.keys(schema.nodes).sort(),
    marks: Object.keys(schema.marks).sort(),
  };
}

describe('the collaborative editor schema', () => {
  it('writes only node and mark types the server renders into a note', () => {
    expect(persistedTypes(collaborativeEditorExtensions())).toEqual(
      persistedTypes(createSemanticExtensions())
    );
  });

  it('keeps every node and mark type a stored note can hold', () => {
    expect(persistedTypes(createSemanticExtensions())).toEqual({
      nodes: STORED_NODE_TYPES,
      marks: STORED_MARK_TYPES,
    });
  });
});
