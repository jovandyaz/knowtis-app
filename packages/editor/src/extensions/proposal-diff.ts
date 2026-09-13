import { Extension } from '@tiptap/core';
import { DOMSerializer, type Node as ProseMirrorNode } from '@tiptap/pm/model';
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

const CHANGE_ATTR = 'data-change';

function withCurrent(base: string, current: boolean): string {
  return current ? `${base} diff-current` : base;
}

function isExpanded(view: ProposalDiffView, index: number): boolean {
  return view.showDeleted || view.expanded.has(index);
}

function deletedElement(
  view: ProposalDiffView,
  index: number,
  change: DocChange
): HTMLElement {
  const slice = view.before.slice(change.fromA, change.toA);
  const isBlock = slice.content.firstChild?.isBlock ?? false;
  const current = view.currentIndex === index;

  if (!isExpanded(view, index)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = withCurrent('diff-del-chip', current);
    chip.setAttribute(CHANGE_ATTR, String(index));
    chip.setAttribute('data-diff-chip', '');
    chip.setAttribute('aria-expanded', 'false');
    chip.textContent = isBlock
      ? view.labels.deletedBlocks(slice.content.childCount)
      : view.labels.deletedInline;
    return chip;
  }

  const wrapper = document.createElement(isBlock ? 'div' : 'span');
  wrapper.className = withCurrent(
    isBlock ? 'diff-del diff-del-block' : 'diff-del',
    current
  );
  wrapper.setAttribute(CHANGE_ATTR, String(index));
  wrapper.appendChild(
    DOMSerializer.fromSchema(view.before.type.schema).serializeFragment(
      slice.content
    )
  );
  return wrapper;
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
      const state = isExpanded(view, index) ? 'open' : 'chip';
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
