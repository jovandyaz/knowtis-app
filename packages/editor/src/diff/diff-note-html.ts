import { generateJSON, getSchema, type AnyExtension } from '@tiptap/core';
import {
  ChangeSet,
  simplifyChanges,
  type TokenEncoder,
} from '@tiptap/pm/changeset';
import type { Mark, Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
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

const MAX_LCS_CELLS = 1_000_000;

const markKeys = new WeakMap<readonly Mark[], string>();

function marksKey(marks: readonly Mark[]): string {
  const cached = markKeys.get(marks);
  if (cached !== undefined) {
    return cached;
  }
  const key = marks
    .map((mark) => `${mark.type.name}${JSON.stringify(mark.attrs)}`)
    .join();
  markKeys.set(marks, key);
  return key;
}

const NOTE_TOKEN_ENCODER: TokenEncoder<number | string> = {
  encodeCharacter: (char, marks) =>
    marks.length === 0 ? char : `${char}:${marksKey(marks)}`,
  encodeNodeStart: (node) =>
    `${node.type.name}${JSON.stringify(node.attrs)}${marksKey(node.marks)}`,
  encodeNodeEnd: (node) => `/${node.type.name}`,
  compareTokens: (a, b) => a === b,
};

function matchEqualBlocksLcs(
  before: ProseMirrorNode,
  after: ProseMirrorNode
): BlockMatch[] {
  const rows = before.childCount;
  const cols = after.childCount;
  const width = cols + 1;
  const lengths = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      lengths[i * width + j] = before.child(i).eq(after.child(j))
        ? lengths[(i + 1) * width + (j + 1)] + 1
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + (j + 1)]);
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
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + (j + 1)]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
}

function matchEqualBlocksPositional(
  before: ProseMirrorNode,
  after: ProseMirrorNode
): BlockMatch[] {
  const matches: BlockMatch[] = [];
  const count = Math.min(before.childCount, after.childCount);
  for (let k = 0; k < count; k += 1) {
    if (before.child(k).eq(after.child(k))) {
      matches.push({ before: k, after: k });
    }
  }
  return matches;
}

function matchEqualBlocks(
  before: ProseMirrorNode,
  after: ProseMirrorNode
): BlockMatch[] {
  const cells = (before.childCount + 1) * (after.childCount + 1);
  return cells > MAX_LCS_CELLS
    ? matchEqualBlocksPositional(before, after)
    : matchEqualBlocksLcs(before, after);
}

function blockSpan(doc: ProseMirrorNode, from: number, to: number): number {
  let size = 0;
  for (let i = from; i < to; i += 1) {
    size += doc.child(i).nodeSize;
  }
  return size;
}

function widenMarkupChange(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  change: DocChange
): DocChange {
  const { fromA, toA, fromB, toB } = change;
  if (
    fromA === toA ||
    fromB === toB ||
    before.textBetween(fromA, toA) !== '' ||
    after.textBetween(fromB, toB) !== ''
  ) {
    return change;
  }
  const nodeA = before.nodeAt(fromA);
  const nodeB = after.nodeAt(fromB);
  if (!nodeA || !nodeB || nodeA.isText || nodeB.isText) {
    return change;
  }
  return {
    fromA,
    toA: Math.max(toA, fromA + nodeA.nodeSize),
    fromB,
    toB: Math.max(toB, fromB + nodeB.nodeSize),
  };
}

function mergeOverlapping(changes: readonly DocChange[]): DocChange[] {
  const merged: DocChange[] = [];
  for (const change of changes) {
    const last = merged.at(-1);
    if (last && (change.fromA < last.toA || change.fromB < last.toB)) {
      merged[merged.length - 1] = {
        fromA: last.fromA,
        toA: Math.max(last.toA, change.toA),
        fromB: last.fromB,
        toB: Math.max(last.toB, change.toB),
      };
    } else {
      merged.push(change);
    }
  }
  return merged;
}

function rewriteChanges(
  before: ProseMirrorNode,
  beforeBlock: ProseMirrorNode,
  afterBlock: ProseMirrorNode,
  posA: number,
  posB: number
): DocChange[] {
  // prosemirror-changeset gives up on word diffs past absolute position 2500,
  // so each pair is diffed inside a doc holding only that block.
  const blockDoc = before.type.create(null, beforeBlock);
  const tr = new Transform(blockDoc).replaceWith(
    0,
    beforeBlock.nodeSize,
    afterBlock
  );
  const changeSet = ChangeSet.create(
    blockDoc,
    undefined,
    NOTE_TOKEN_ENCODER
  ).addSteps(tr.doc, tr.mapping.maps, null);
  const widened = simplifyChanges(changeSet.changes, tr.doc).map((change) =>
    widenMarkupChange(blockDoc, tr.doc, change)
  );
  return mergeOverlapping(widened).map(({ fromA, toA, fromB, toB }) => ({
    fromA: fromA + posA,
    toA: toA + posA,
    fromB: fromB + posB,
    toB: toB + posB,
  }));
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
