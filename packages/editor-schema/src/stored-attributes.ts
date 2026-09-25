import type { JSONContent } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html/server';

import { TRAILING_NEWLINES } from '@knowtis/note-markdown';

import { IMAGE_NODE_NAME, IMAGE_SRC_ATTR } from './image-node';
import { MERMAID_BLOCK_NAME, MERMAID_VIEW_MODE } from './mermaid-block-node';
import { noteSchemaExtensions } from './note-schema';
import { HIGHLIGHT_MARK_NAME } from './semantic-extensions';

type Attributes = Record<string, unknown>;

interface Carrier {
  readonly key: string;
  readonly attrs: Attributes;
}

interface KeyedAttributes {
  readonly carriersOf: (node: JSONContent) => Carrier[];
  readonly unset: Readonly<Attributes>;
}

const CODE_ATTR = 'code';

function carrier(attrs: Attributes | undefined, key: unknown): Carrier[] {
  return attrs && typeof key === 'string' ? [{ key, attrs }] : [];
}

// The converter trims a diagram's trailing newlines, so its key must too.
function diagramKey(code: unknown): unknown {
  return typeof code === 'string' ? code.replace(TRAILING_NEWLINES, '') : code;
}

const RESTORED: readonly KeyedAttributes[] = [
  {
    carriersOf: (node) =>
      node.type === IMAGE_NODE_NAME
        ? carrier(node.attrs, node.attrs?.[IMAGE_SRC_ATTR])
        : [],
    unset: { width: null, height: null },
  },
  {
    carriersOf: (node) =>
      node.type === MERMAID_BLOCK_NAME
        ? carrier(node.attrs, diagramKey(node.attrs?.[CODE_ATTR]))
        : [],
    unset: { viewMode: MERMAID_VIEW_MODE.SPLIT },
  },
  {
    carriersOf: (node) =>
      (node.marks ?? [])
        .filter((mark) => mark.type === HIGHLIGHT_MARK_NAME)
        .flatMap((mark) => carrier(mark.attrs, node.text)),
    unset: { color: null },
  },
];

function isUnset(value: unknown, unset: unknown): boolean {
  return value == null || value === '' || value === unset;
}

function carriersIn(
  node: JSONContent,
  kind: KeyedAttributes,
  into: Carrier[] = []
): Carrier[] {
  into.push(...kind.carriersOf(node));
  for (const child of node.content ?? []) {
    carriersIn(child, kind, into);
  }
  return into;
}

function byKey(carriers: readonly Carrier[]): Map<string, Carrier[]> {
  const queues = new Map<string, Carrier[]>();
  for (const found of carriers) {
    queues.set(found.key, [...(queues.get(found.key) ?? []), found]);
  }
  return queues;
}

function copyUnset(
  unset: Readonly<Attributes>,
  from: Attributes,
  to: Attributes
): boolean {
  let changed = false;
  for (const [name, markdownValue] of Object.entries(unset)) {
    if (
      isUnset(to[name], markdownValue) &&
      !isUnset(from[name], markdownValue)
    ) {
      to[name] = from[name];
      changed = true;
    }
  }
  return changed;
}

/** Copies the attributes Markdown drops from `stored` onto `proposed`, matching each content key's n-th occurrence to its n-th stored one. */
export function restoreStoredAttributes(
  stored: string,
  proposed: string
): string {
  const storedDoc: JSONContent = generateJSON(stored, noteSchemaExtensions);
  const proposedDoc: JSONContent = generateJSON(proposed, noteSchemaExtensions);
  let changed = false;
  for (const kind of RESTORED) {
    const storedByKey = byKey(carriersIn(storedDoc, kind));
    for (const target of carriersIn(proposedDoc, kind)) {
      const source = storedByKey.get(target.key)?.shift();
      if (source) {
        changed = copyUnset(kind.unset, source.attrs, target.attrs) || changed;
      }
    }
  }
  return changed ? generateHTML(proposedDoc, noteSchemaExtensions) : proposed;
}
