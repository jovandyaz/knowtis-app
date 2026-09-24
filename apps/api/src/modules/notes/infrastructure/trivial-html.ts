import { Logger } from '@nestjs/common';
import { generateJSON } from '@tiptap/html/server';

import {
  createSemanticExtensions,
  isTrivialProseMirrorDoc,
} from '@knowtis/editor-schema';

import { reasonOf } from '../../../core/errors/reason-of';
import { editorSchema } from './html-to-yjs';

const tiptapExtensions = [...createSemanticExtensions()];

const logger = new Logger('TrivialHtml');

function warnParseFailure(stage: string, error: unknown): void {
  logger.warn({
    event: 'notes.trivial_html.parse_failed',
    stage,
    reason: reasonOf(error),
  });
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
