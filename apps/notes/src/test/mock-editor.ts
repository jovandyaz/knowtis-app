import type { Editor } from '@tiptap/react';
import { vi } from 'vitest';

const EDITOR_WIDTH = 400;

export function createMockEditor(): Editor {
  const dom = document.createElement('div');
  Object.defineProperty(dom, 'getBoundingClientRect', {
    value: () => ({
      width: EDITOR_WIDTH,
      height: 0,
      top: 0,
      left: 0,
      right: EDITOR_WIDTH,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  return {
    view: {
      dom,
      coordsAtPos: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    },
    state: { selection: { to: 0 } },
    commands: { focus: vi.fn() },
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Editor;
}
