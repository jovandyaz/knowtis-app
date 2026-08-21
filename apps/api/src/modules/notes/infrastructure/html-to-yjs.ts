import { getSchema } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html/server';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import {
  createSemanticExtensions,
  YJS_XML_FRAGMENT_NAME,
} from '@knowtis/editor-schema';

const tiptapExtensions = [...createSemanticExtensions()];

export const editorSchema = getSchema(tiptapExtensions);

export function htmlToYjsState(html: string): Buffer {
  const json = generateJSON(html, tiptapExtensions);
  const yDoc = prosemirrorJSONToYDoc(editorSchema, json, YJS_XML_FRAGMENT_NAME);
  const state = Y.encodeStateAsUpdate(yDoc);
  yDoc.destroy();
  return Buffer.from(state);
}

/** Inverse of {@link htmlToYjsState}: renders the live Y.Doc's XML fragment to
 *  the canonical HTML used for previews, search and MCP reads. */
export function yDocToHtml(doc: Y.Doc): string {
  const json = yDocToProsemirrorJSON(doc, YJS_XML_FRAGMENT_NAME);
  return generateHTML(json, tiptapExtensions);
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
