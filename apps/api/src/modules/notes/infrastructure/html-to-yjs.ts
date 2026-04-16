import { getSchema } from '@tiptap/core';
import { generateJSON } from '@tiptap/html/server';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
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
