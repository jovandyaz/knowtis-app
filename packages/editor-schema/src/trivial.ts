import type { Node as PMNode } from '@tiptap/pm/model';
import type * as Y from 'yjs';
import { XmlElement } from 'yjs';

// Single source of truth for the blocks an empty editor can produce. Adding a
// new default block here updates every trivial-doc guard at once.
const EMPTY_BLOCK_NODES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
]);

function isEmptyBlockName(name: string | undefined | null): boolean {
  return typeof name === 'string' && EMPTY_BLOCK_NODES.has(name);
}

function onlyHardBreaks(block: Y.XmlElement): boolean {
  for (let i = 0; i < block.length; i += 1) {
    const child = block.get(i);
    if (!(child instanceof XmlElement) || child.nodeName !== 'hardBreak') {
      return false;
    }
  }
  return true;
}

export function isTrivialFragment(fragment: Y.XmlFragment): boolean {
  if (fragment.length === 0) {
    return true;
  }
  if (fragment.length > 1) {
    return false;
  }
  const only = fragment.get(0);
  if (!(only instanceof XmlElement) || !isEmptyBlockName(only.nodeName)) {
    return false;
  }
  return only.length === 0 || onlyHardBreaks(only);
}

function childrenAreOnlyHardBreaks(node: PMNode): boolean {
  let allHardBreaks = true;
  node.forEach((child) => {
    if (child.type.name !== 'hardBreak') {
      allHardBreaks = false;
    }
  });
  return allHardBreaks;
}

export function isTrivialProseMirrorDoc(doc: PMNode): boolean {
  if (doc.childCount === 0) {
    return true;
  }
  if (doc.childCount > 1) {
    return false;
  }
  const first = doc.firstChild;
  if (first === null || !isEmptyBlockName(first.type.name)) {
    return false;
  }
  return first.content.size === 0 || childrenAreOnlyHardBreaks(first);
}
