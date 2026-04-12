import { Node, ReactNodeViewRenderer } from '@tiptap/react';

import { MERMAID_VIEW_MODE } from './constants';
import { MermaidBlockView } from './MermaidBlockView';

export const MermaidBlockNode = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      code: {
        default: 'graph TD\n  A[Start] --> B[End]',
      },
      viewMode: {
        default: MERMAID_VIEW_MODE.SPLIT,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-mermaid-block]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', { ...HTMLAttributes, 'data-mermaid-block': '' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView);
  },
});
