import { generateJSON } from '@tiptap/html/server';

import {
  createSemanticExtensions,
  isTrivialProseMirrorDoc,
} from '@knowtis/editor-schema';

import { reasonOf } from '../../../core/errors/reason-of';
import { editorSchema } from './html-to-yjs';

const tiptapExtensions = [...createSemanticExtensions()];

function warnParseFailure(stage: string, error: unknown): void {
  const message = reasonOf(error);
  console.warn(
    `isTrivialHtml: ${stage} failed, treating as trivial — ${message}`
  );
}

/**
 * Null/undefined/whitespace/unparseable input all return true so callers that
 * reject trivial content also reject malformed payloads.
 */
export function isTrivialHtml(html: string | null | undefined): boolean {
  if (html == null || html.trim() === '') {
    return true;
  }

  let json: unknown;
  try {
    json = generateJSON(html, tiptapExtensions);
  } catch (error) {
    warnParseFailure('generateJSON', error);
    return true;
  }

  try {
    const doc = editorSchema.nodeFromJSON(json);
    return isTrivialProseMirrorDoc(doc);
  } catch (error) {
    warnParseFailure('nodeFromJSON', error);
    return true;
  }
}
