import { useState } from 'react';

import { useAIStore } from '@/stores/ai.store';
import { act, fireEvent, render } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@knowtis/design-system';

import { AIResultPanel } from './AIResultPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('tippy.js', () => ({
  default: () => ({ destroy: vi.fn() }),
}));

vi.mock('streamdown', () => ({
  Streamdown: () => null,
}));

function createMockEditor(): Editor {
  const dom = document.createElement('div');
  Object.defineProperty(dom, 'getBoundingClientRect', {
    value: () => ({
      width: 400,
      height: 0,
      top: 0,
      left: 0,
      right: 400,
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
  } as unknown as Editor;
}

function pressEscape() {
  act(() => {
    fireEvent.keyDown(document.body, { key: 'Escape' });
  });
}

function TestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="Close dialog">
        <DialogTitle>Test dialog</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

describe('AIResultPanel', () => {
  afterEach(() => {
    act(() => {
      useAIStore.getState().reset();
    });
  });

  it('discards the panel on Escape when it is the only layer', () => {
    const editor = createMockEditor();
    useAIStore.setState({ status: 'error' });
    render(<AIResultPanel editor={editor} />);

    pressEscape();

    expect(useAIStore.getState().status).toBe('idle');
    expect(editor.commands.focus).toHaveBeenCalledTimes(1);
  });

  it('closes a dialog opened over the panel and leaves the panel untouched', () => {
    const editor = createMockEditor();
    useAIStore.setState({ status: 'error' });
    const onOpenChange = vi.fn();
    render(
      <>
        <AIResultPanel editor={editor} />
        <TestDialog open onOpenChange={onOpenChange} />
      </>
    );

    pressEscape();

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useAIStore.getState().status).toBe('error');
    expect(editor.commands.focus).not.toHaveBeenCalled();
  });

  it('lets the next Escape reach the panel once the dialog is gone', () => {
    const editor = createMockEditor();
    useAIStore.setState({ status: 'error' });

    function Harness() {
      const [dialogOpen, setDialogOpen] = useState(true);
      return (
        <>
          <AIResultPanel editor={editor} />
          <TestDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
      );
    }

    render(<Harness />);

    pressEscape();
    expect(useAIStore.getState().status).toBe('error');

    pressEscape();

    expect(useAIStore.getState().status).toBe('idle');
    expect(editor.commands.focus).toHaveBeenCalledTimes(1);
  });
});
