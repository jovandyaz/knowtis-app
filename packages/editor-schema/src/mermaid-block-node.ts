import { Node } from '@tiptap/core';

export const MERMAID_BLOCK_NAME = 'mermaidBlock' as const;

export const MERMAID_VIEW_MODE = {
  CODE: 'code',
  PREVIEW: 'preview',
  SPLIT: 'split',
} as const;

export type MermaidViewMode =
  (typeof MERMAID_VIEW_MODE)[keyof typeof MERMAID_VIEW_MODE];

const MERMAID_VIEW_MODES = new Set<string>(Object.values(MERMAID_VIEW_MODE));

function isMermaidViewMode(value: unknown): value is MermaidViewMode {
  return typeof value === 'string' && MERMAID_VIEW_MODES.has(value);
}

const DEFAULT_MERMAID_CODE = 'graph TD\n  A[Start] --> B[End]';

const MERMAID_BLOCK_TAG = 'div[data-mermaid-block]';

export const MermaidBlockNode = Node.create({
  name: MERMAID_BLOCK_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      code: {
        default: DEFAULT_MERMAID_CODE,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-code') ?? DEFAULT_MERMAID_CODE,
        renderHTML: (attributes: { code: string }) => ({
          'data-code': attributes.code,
        }),
      },
      viewMode: {
        default: MERMAID_VIEW_MODE.SPLIT,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('data-view-mode');
          return isMermaidViewMode(raw) ? raw : MERMAID_VIEW_MODE.SPLIT;
        },
        renderHTML: (attributes: { viewMode: MermaidViewMode }) => ({
          'data-view-mode': attributes.viewMode,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: MERMAID_BLOCK_TAG }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', { ...HTMLAttributes, 'data-mermaid-block': '' }];
  },
});
