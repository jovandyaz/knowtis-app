import { Extension } from '@tiptap/core';
import {
  DOMSerializer,
  type Node as ProseMirrorNode,
  type Slice,
} from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import type { DocChange } from '../diff/diff-note-html';

import './proposal-diff.css';

export interface ProposalDiffLabels {
  deletedBlocks: (count: number) => string;
  deletedInline: string;
}

export interface ProposalDiffView {
  before: ProseMirrorNode;
  changes: readonly DocChange[];
  showDeleted: boolean;
  currentIndex: number | null;
  expanded: ReadonlySet<number>;
  labels: ProposalDiffLabels;
}

interface ProposalDiffPluginState {
  view: ProposalDiffView | null;
  decorations: DecorationSet;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    proposalDiff: {
      setProposalDiffView: (view: ProposalDiffView) => ReturnType;
    };
  }
}

export const proposalDiffPluginKey = new PluginKey<ProposalDiffPluginState>(
  'proposalDiff'
);

export const CHANGE_ATTR = 'data-change';
export const CHIP_ATTR = 'data-diff-chip';

function withCurrent(base: string, current: boolean): string {
  return current ? `${base} diff-current` : base;
}

function isExpanded(view: ProposalDiffView, index: number): boolean {
  return view.showDeleted || view.expanded.has(index);
}

// A slice torn mid-node has an empty boundary child at its open edge(s);
// drop it by position (openStart/openEnd), not emptiness, so a real empty paragraph still counts.
function countRemovedBlocks(slice: Slice): number {
  const { content, openStart, openEnd } = slice;
  let count = content.childCount;
  const first = content.firstChild;
  if (openStart > 0 && first && first.content.size === 0) {
    count -= 1;
  }
  if (content.childCount > 1) {
    const last = content.lastChild;
    if (openEnd > 0 && last && last.content.size === 0) {
      count -= 1;
    }
  }
  return Math.max(count, 1);
}

// The widget mirrors past content, so it must never be an edit target.
function inert<T extends HTMLElement>(element: T): T {
  element.setAttribute('contenteditable', 'false');
  return element;
}

function chipElement(
  index: number,
  className: string,
  label: string,
  expanded: boolean
): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = className;
  chip.setAttribute(CHANGE_ATTR, String(index));
  chip.setAttribute(CHIP_ATTR, '');
  chip.setAttribute('aria-expanded', String(expanded));
  chip.textContent = label;
  return chip;
}

function deletedElement(
  view: ProposalDiffView,
  index: number,
  change: DocChange
): HTMLElement {
  const slice = view.before.slice(change.fromA, change.toA);
  const isBlock = slice.content.firstChild?.isBlock ?? false;
  const current = view.currentIndex === index;
  const label = isBlock
    ? view.labels.deletedBlocks(countRemovedBlocks(slice))
    : view.labels.deletedInline;

  if (!isExpanded(view, index)) {
    return inert(
      chipElement(index, withCurrent('diff-del-chip', current), label, false)
    );
  }

  const wrapper = document.createElement(isBlock ? 'div' : 'span');
  wrapper.className = 'diff-del-group';
  wrapper.setAttribute(CHANGE_ATTR, String(index));
  // While the switch expands every deletion, a per-deletion toggle could not
  // honour a collapse, so the honest control is no control at all.
  if (!view.showDeleted) {
    wrapper.appendChild(chipElement(index, 'diff-del-chip', label, true));
  }

  const content = document.createElement('del');
  content.className = withCurrent(
    isBlock ? 'diff-del diff-del-block' : 'diff-del',
    current
  );
  content.appendChild(
    DOMSerializer.fromSchema(view.before.type.schema).serializeFragment(
      slice.content
    )
  );
  wrapper.appendChild(content);
  return inert(wrapper);
}

function buildDecorations(
  doc: ProseMirrorNode,
  view: ProposalDiffView
): DecorationSet {
  const decorations: Decoration[] = [];

  view.changes.forEach((change, index) => {
    const current = view.currentIndex === index;

    if (change.fromB < change.toB) {
      decorations.push(
        Decoration.inline(change.fromB, change.toB, {
          nodeName: 'ins',
          class: withCurrent('diff-ins', current),
          [CHANGE_ATTR]: String(index),
        })
      );
      doc.nodesBetween(change.fromB, change.toB, (node, pos) => {
        if (!node.isBlock) {
          return false;
        }
        if (pos >= change.fromB && pos + node.nodeSize <= change.toB) {
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: 'diff-ins-block',
            })
          );
          return false;
        }
        return true;
      });
    }

    if (change.fromA < change.toA) {
      const state = !isExpanded(view, index)
        ? 'chip'
        : view.showDeleted
          ? 'open'
          : 'open-toggle';
      decorations.push(
        Decoration.widget(
          change.fromB,
          () => deletedElement(view, index, change),
          { side: -1, key: `del-${index}-${state}-${current ? 'cur' : ''}` }
        )
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const ProposalDiff = Extension.create({
  name: 'proposalDiff',

  addCommands() {
    return {
      setProposalDiffView:
        (view) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(proposalDiffPluginKey, view);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<ProposalDiffPluginState>({
        key: proposalDiffPluginKey,
        state: {
          init: () => ({ view: null, decorations: DecorationSet.empty }),
          apply(tr: Transaction, prev) {
            const next = tr.getMeta(proposalDiffPluginKey) as
              | ProposalDiffView
              | undefined;
            if (next) {
              return {
                view: next,
                decorations: buildDecorations(tr.doc, next),
              };
            }
            if (tr.docChanged) {
              return {
                view: prev.view,
                decorations: prev.decorations.map(tr.mapping, tr.doc),
              };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            return (
              proposalDiffPluginKey.getState(state)?.decorations ??
              DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});
