import { yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { htmlToYjsState } from '../../../notes/infrastructure/html-to-yjs';

interface DocumentNode {
  readonly type: string;
  readonly content?: readonly DocumentNode[];
}

function nodeCounts(html: string): Map<string, number> | null {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, htmlToYjsState(html));
    const counts = new Map<string, number>();
    const walk = (node: DocumentNode): void => {
      counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
      for (const child of node.content ?? []) {
        walk(child);
      }
    };
    walk(yDocToProsemirrorJSON(doc, YJS_XML_FRAGMENT_NAME) as DocumentNode);
    return counts;
  } catch {
    return null;
  } finally {
    doc.destroy();
  }
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
