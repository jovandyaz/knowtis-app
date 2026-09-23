import type { JSONContent } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html/server';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import {
  createSemanticExtensions,
  IMAGE_NODE_NAME,
  YJS_XML_FRAGMENT_NAME,
} from '@knowtis/editor-schema';
import { isStoredImageUrl } from '@knowtis/shared-util';

export const SRC_ATTR = 'src';

export const noteSchemaExtensions = [...createSemanticExtensions()];

export const editorSchema = getSchema(noteSchemaExtensions);

function isForeignImage(node: JSONContent): boolean {
  if (node.type !== IMAGE_NODE_NAME) {
    return false;
  }
  const src: unknown = node.attrs?.[SRC_ATTR];
  return typeof src !== 'string' || !isStoredImageUrl(src);
}

// Every server-side write builds its state here, and an image the app did not
// store is a URL every later reader's browser would fetch.
function withoutForeignImages(node: JSONContent): JSONContent {
  if (!node.content) {
    return node;
  }
  return {
    ...node,
    content: node.content
      .filter((child) => !isForeignImage(child))
      .map(withoutForeignImages),
  };
}

export function htmlToYjsState(html: string): Buffer {
  const json = withoutForeignImages(generateJSON(html, noteSchemaExtensions));
  const yDoc = prosemirrorJSONToYDoc(editorSchema, json, YJS_XML_FRAGMENT_NAME);
  const state = Y.encodeStateAsUpdate(yDoc);
  yDoc.destroy();
  return Buffer.from(state);
}

/** Inverse of {@link htmlToYjsState}: renders the live Y.Doc's XML fragment to
 *  the canonical HTML used for previews, search and MCP reads. */
export function yDocToHtml(doc: Y.Doc): string {
  const json = yDocToProsemirrorJSON(doc, YJS_XML_FRAGMENT_NAME);
  return generateHTML(json, noteSchemaExtensions);
}

/** Loads an encoded CRDT state into a throwaway Y.Doc for `read`, destroying the doc afterwards. */
export function withYDoc<T>(state: Buffer, read: (doc: Y.Doc) => T): T {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, new Uint8Array(state));
    return read(doc);
  } finally {
    doc.destroy();
  }
}

/** The HTML an encoded CRDT state renders to — what a note's `content` column must agree with. */
export function yjsStateToHtml(state: Buffer): string {
  return withYDoc(state, yDocToHtml);
}

/**
 * Rewrites an existing note's CRDT state to `html`, keeping its history.
 *
 * The old content is tombstoned rather than discarded, so a client holding
 * the previous state merges this as an edit instead of as a second parallel
 * copy of the note — the same clear-then-apply the live-document broadcast
 * performs.
 */
export function evolveYjsState(existing: Buffer, html: string): Buffer {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(existing));

  const next = htmlToYjsState(html);
  doc.transact(() => {
    const fragment = doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
    fragment.delete(0, fragment.length);
    Y.applyUpdate(doc, new Uint8Array(next));
  });

  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return Buffer.from(state);
}
