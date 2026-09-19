import { yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { htmlToYjsState } from '../../../notes/infrastructure/html-to-yjs';

export interface PMJson {
  readonly type: string;
  readonly attrs?: Record<string, unknown>;
  readonly marks?: readonly { readonly type: string }[];
  readonly content?: readonly PMJson[];
}

/** Exercises every construct the note editor's schema models, so a conversion that drops one is visible. */
export const EDITOR_VOCABULARY_MARKDOWN = [
  '# Trip',
  '',
  'Fly to [Guatemala](https://example.com/gt) with **cash**.',
  '',
  '| City | Days |',
  '| --- | --- |',
  '| Antigua | 2 |',
  '',
  '- [x] passport',
  '- [ ] visa',
  '  - [x] photo',
  '',
  'Bring ==sunscreen== and H~2~O for the 30^th^.',
  '',
  '```mermaid',
  'flowchart LR',
  '  A --> B',
  '```',
].join('\n');

/** The ProseMirror document the collaboration layer would persist for `html`. */
export function persistedDocument(html: string): PMJson {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, htmlToYjsState(html));
  const json = yDocToProsemirrorJSON(doc, YJS_XML_FRAGMENT_NAME) as PMJson;
  doc.destroy();
  return json;
}

/** Every node and mark type present in `node`, flattened. */
export function collectTypes(
  node: PMJson,
  into = new Set<string>()
): Set<string> {
  into.add(node.type);
  for (const mark of node.marks ?? []) {
    into.add(mark.type);
  }
  for (const child of node.content ?? []) {
    collectTypes(child, into);
  }
  return into;
}
