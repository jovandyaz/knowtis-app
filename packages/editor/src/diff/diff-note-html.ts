import { generateJSON, getSchema, type AnyExtension } from '@tiptap/core';
import { ChangeSet, simplifyChanges } from '@tiptap/pm/changeset';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';

export interface DocChange {
  /** Range in the before document; empty (fromA === toA) for a pure insertion. */
  readonly fromA: number;
  readonly toA: number;
  /** Range in the after document; empty (fromB === toB) for a pure deletion. */
  readonly fromB: number;
  readonly toB: number;
}

export interface DocDiff {
  readonly before: ProseMirrorNode;
  readonly after: ProseMirrorNode;
  readonly changes: readonly DocChange[];
  readonly count: number;
}

const schemaCache = new WeakMap<AnyExtension[], Schema>();

function schemaFor(extensions: AnyExtension[]): Schema {
  const cached = schemaCache.get(extensions);
  if (cached) {
    return cached;
  }
  const schema = getSchema(extensions);
  schemaCache.set(extensions, schema);
  return schema;
}

/**
 * Word-level diff between two note HTML documents parsed with the given
 * extensions. Both sides must use the same schema the note will be stored
 * with, or content the schema cannot represent disappears from the diff.
 * Browser-only: `generateJSON` from `@tiptap/core` needs a DOMParser (the
 * server converts with `@tiptap/html/server` instead).
 */
export function diffNoteHtml(
  beforeHtml: string,
  afterHtml: string,
  extensions: AnyExtension[]
): DocDiff {
  const schema = schemaFor(extensions);
  const before = schema.nodeFromJSON(generateJSON(beforeHtml, extensions));
  const proposed = schema.nodeFromJSON(generateJSON(afterHtml, extensions));
  const tr = new Transform(before).replaceWith(
    0,
    before.content.size,
    proposed.content
  );
  const changeSet = ChangeSet.create(before).addSteps(
    tr.doc,
    tr.mapping.maps,
    null
  );
  const changes = simplifyChanges(changeSet.changes, tr.doc).map(
    ({ fromA, toA, fromB, toB }) => ({ fromA, toA, fromB, toB })
  );
  return { before, after: tr.doc, changes, count: changes.length };
}
