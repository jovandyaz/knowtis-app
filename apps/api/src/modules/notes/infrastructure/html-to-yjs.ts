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
