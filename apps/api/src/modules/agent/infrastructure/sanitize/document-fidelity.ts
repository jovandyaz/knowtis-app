import type { JSONContent } from '@tiptap/core';
import { generateJSON } from '@tiptap/html/server';

import { BLANK_TEXT } from '@knowtis/note-markdown';

import {
  isForeignImage,
  noteSchemaExtensions,
} from '../../../notes/infrastructure/html-to-yjs';

// `<p>&nbsp;</p>` reads back as an empty paragraph that looks the same, so
// counting its text would refuse an edit that loses nothing.
function isBlankText(node: JSONContent): boolean {
  return node.type === 'text' && BLANK_TEXT.test(node.text ?? '');
}

// Every sanitizer drops an image the app never stored, caption and all, so
// counting it would refuse any edit to a note that holds one.
function countInto(node: JSONContent, counts: Map<string, number>): void {
  if (isForeignImage(node)) {
    return;
  }
  if (node.type && !isBlankText(node)) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  for (const child of node.content ?? []) {
    countInto(child, counts);
  }
}

function nodeCounts(html: string): Map<string, number> | null {
  let doc: JSONContent;
  try {
    doc = generateJSON(html, noteSchemaExtensions);
  } catch {
    return null;
  }
  const counts = new Map<string, number>();
  countInto(doc, counts);
  return counts;
}

/**
 * Node types the editor would hold fewer of after `after` replaces `before`.
 * An edit changes the text of one region but rebuilds the whole body, so a
 * construct the converter pair cannot carry disappears from regions nobody
 * touched. Counting node types catches that without naming which constructs
 * are lossy today. Empty when either document cannot be parsed: absence of
 * evidence is not evidence of loss.
 */
export function nodesLostBetween(before: string, after: string): string[] {
  const from = nodeCounts(before);
  const to = nodeCounts(after);
  if (!from || !to) {
    return [];
  }
  return [...from.entries()]
    .filter(([type, count]) => (to.get(type) ?? 0) < count)
    .map(([type]) => type)
    .sort();
}
