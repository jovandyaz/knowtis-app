import { createNodeFromContent } from '@tiptap/core';
import { Fragment, type Schema } from '@tiptap/pm/model';
import type { Config } from 'dompurify';

import { markdownToHtml } from '@knowtis/note-markdown';

import {
  AI_HTML_PURIFY_CONFIG,
  createAiHtmlPurifier,
} from '../../markdown/ai-html-purifier';

const IMAGE_FIGURE_TAG = 'figure';

const MARKDOWN_PURIFY_CONFIG = {
  ...AI_HTML_PURIFY_CONFIG,
  ADD_FORBID_CONTENTS: [IMAGE_FIGURE_TAG],
} satisfies Config;

const purifier = createAiHtmlPurifier();

/**
 * Parses markdown into editor nodes, keeping only what the note schema reads
 * (`AI_HTML_PURIFY_CONFIG`): an image the model writes never reaches the
 * editor, and neither does its caption. Whitespace collapses as it does in the
 * rendered preview, so a soft line break reads as a space; code blocks keep
 * theirs.
 */
export function markdownToFragment(markdown: string, schema: Schema): Fragment {
  const html = purifier.sanitize(
    markdownToHtml(markdown),
    MARKDOWN_PURIFY_CONFIG
  );
  return Fragment.from(createNodeFromContent(html, schema));
}
