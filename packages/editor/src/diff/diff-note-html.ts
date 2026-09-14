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

interface BlockMatch {
  readonly before: number;
  readonly after: number;
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

function matchEqualBlocks(
  before: ProseMirrorNode,
  after: ProseMirrorNode
): BlockMatch[] {
  const rows = before.childCount;
  const cols = after.childCount;
  const lengths = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0)
  );
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      lengths[i][j] = before.child(i).eq(after.child(j))
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const matches: BlockMatch[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before.child(i).eq(after.child(j))) {
      matches.push({ before: i, after: j });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
}

function blockSpan(doc: ProseMirrorNode, from: number, to: number): number {
  let size = 0;
  for (let i = from; i < to; i += 1) {
    size += doc.child(i).nodeSize;
  }
  return size;
}

function rewriteChanges(
  before: ProseMirrorNode,
  beforeBlock: ProseMirrorNode,
  afterBlock: ProseMirrorNode,
  posA: number,
  posB: number
): DocChange[] {
  const tr = new Transform(before).replaceWith(
    posA,
    posA + beforeBlock.nodeSize,
    afterBlock
  );
  const changeSet = ChangeSet.create(before).addSteps(
    tr.doc,
    tr.mapping.maps,
    null
  );
  const shift = posB - posA;
  const changes = simplifyChanges(changeSet.changes, tr.doc).map(
    ({ fromA, toA, fromB, toB }) => ({
      fromA,
      toA,
      fromB: fromB + shift,
      toB: toB + shift,
    })
  );
  if (changes.length > 0) {
    return changes;
  }
  // Markup-only rewrites (a heading level, say) tokenise identically on both
  // sides, so the word diff sees nothing; report the whole block instead.
  return [
    {
      fromA: posA,
      toA: posA + beforeBlock.nodeSize,
      fromB: posB,
      toB: posB + afterBlock.nodeSize,
    },
  ];
}

/**
 * Block-aligned diff of two note HTML documents; both sides must parse with the
 * note's stored schema, and `generateJSON` makes it browser-only (it needs a
 * DOMParser).
 */
export function diffNoteHtml(
  beforeHtml: string,
  afterHtml: string,
  extensions: AnyExtension[]
): DocDiff {
  const schema = schemaFor(extensions);
  const before = schema.nodeFromJSON(generateJSON(beforeHtml, extensions));
  const after = schema.nodeFromJSON(generateJSON(afterHtml, extensions));

  const changes: DocChange[] = [];
  let posA = 0;
  let posB = 0;

  const diffRun = (
    fromI: number,
    toI: number,
    fromJ: number,
    toJ: number
  ): void => {
    const paired = Math.min(toI - fromI, toJ - fromJ);
    for (let k = 0; k < paired; k += 1) {
      const beforeBlock = before.child(fromI + k);
      const afterBlock = after.child(fromJ + k);
      changes.push(
        ...rewriteChanges(before, beforeBlock, afterBlock, posA, posB)
      );
      posA += beforeBlock.nodeSize;
      posB += afterBlock.nodeSize;
    }

    const removed = blockSpan(before, fromI + paired, toI);
    if (removed > 0) {
      changes.push({
        fromA: posA,
        toA: posA + removed,
        fromB: posB,
        toB: posB,
      });
      posA += removed;
    }

    const added = blockSpan(after, fromJ + paired, toJ);
    if (added > 0) {
      changes.push({ fromA: posA, toA: posA, fromB: posB, toB: posB + added });
      posB += added;
    }
  };

  let nextI = 0;
  let nextJ = 0;
  for (const match of matchEqualBlocks(before, after)) {
    diffRun(nextI, match.before, nextJ, match.after);
    posA += before.child(match.before).nodeSize;
    posB += after.child(match.after).nodeSize;
    nextI = match.before + 1;
    nextJ = match.after + 1;
  }
  diffRun(nextI, before.childCount, nextJ, after.childCount);

  return { before, after, changes, count: changes.length };
}
