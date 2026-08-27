import { useEffect, useRef } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu';

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete note</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
  return onOpenChange;
}

function ShareThenVerify({
  topOpen,
  shareDisabled = false,
}: {
  topOpen: boolean;
  shareDisabled?: boolean;
}) {
  return (
    <>
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogTitle>Share</DialogTitle>
          <button type="button" disabled={shareDisabled}>
            Anyone with the link
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={topOpen} onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogTitle>Verify</DialogTitle>
          <input aria-label="Code" />
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('Dialog accessibility', () => {
  it('labels the dialog with the DialogTitle id', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const title = screen.getByText('Delete note');
    expect(title.id).toBe(labelledBy);
  });

  it('describes the dialog with the DialogDescription id', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const description = screen.getByText('This action cannot be undone.');
    expect(description.id).toBe(describedBy);
  });

  it('closes on Escape when focus is on the body', () => {
    const onOpenChange = renderDialog();

    document.body.focus();
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ignores every key that is not Escape', () => {
    const onOpenChange = renderDialog();

    fireEvent.keyDown(document.body, { key: 'a' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('marks the Escape as spent so an outer listener can tell', () => {
    renderDialog();
    const seenAsSpent = vi.fn();
    const record = (event: globalThis.KeyboardEvent) =>
      seenAsSpent(event.defaultPrevented);
    window.addEventListener('keydown', record);

    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    } finally {
      window.removeEventListener('keydown', record);
    }

    expect(seenAsSpent).toHaveBeenCalledWith(true);
  });

  it('leaves an Escape a nested dismissable layer already spent alone', async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <DropdownMenu>
            <DropdownMenuTrigger>Model</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Sonnet</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogContent>
      </Dialog>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Model' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('removes the Escape listener when closed', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Hidden</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('omits aria-labelledby and aria-describedby when no title or description is rendered', () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent>Plain content</DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeNull();
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
  });

  it('closes only the topmost dialog on Escape when dialogs are stacked', () => {
    const onOuterChange = vi.fn();
    const onInnerChange = vi.fn();
    render(
      <>
        <Dialog open onOpenChange={onOuterChange}>
          <DialogContent>
            <DialogTitle>Outer</DialogTitle>
          </DialogContent>
        </Dialog>
        <Dialog open onOpenChange={onInnerChange}>
          <DialogContent>
            <DialogTitle>Inner</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onInnerChange).toHaveBeenCalledWith(false);
    expect(onOuterChange).not.toHaveBeenCalled();
  });

  it('still closes the topmost dialog after the one underneath re-renders', () => {
    const onOuterChange = vi.fn();
    const onInnerChange = vi.fn();
    function StackedDialogs({ tick }: { tick: number }) {
      return (
        <>
          <Dialog open onOpenChange={() => onOuterChange(tick)}>
            <DialogContent>
              <DialogTitle>Outer</DialogTitle>
            </DialogContent>
          </Dialog>
          <Dialog open onOpenChange={onInnerChange}>
            <DialogContent>
              <DialogTitle>Inner</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<StackedDialogs tick={0} />);
    rerender(<StackedDialogs tick={1} />);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onInnerChange).toHaveBeenCalledWith(false);
    expect(onOuterChange).not.toHaveBeenCalled();
  });

  it('answers Escape from one listener, so a stacked pair cannot both spend it', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    render(
      <>
        <Dialog open onOpenChange={vi.fn()}>
          <DialogContent>
            <DialogTitle>Outer</DialogTitle>
          </DialogContent>
        </Dialog>
        <Dialog open onOpenChange={vi.fn()}>
          <DialogContent>
            <DialogTitle>Inner</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );

    const keydownListeners = addListener.mock.calls.filter(
      ([type]) => type === 'keydown'
    );
    expect(keydownListeners).toHaveLength(1);
    addListener.mockRestore();
  });

  it('stops listening for Escape once the last dialog closes', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    function Sole({ open }: { open: boolean }) {
      return (
        <Dialog open={open} onOpenChange={vi.fn()}>
          <DialogContent>
            <DialogTitle>Sole</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }

    const { rerender } = render(<Sole open />);
    rerender(<Sole open={false} />);

    const keydownRemovals = removeListener.mock.calls.filter(
      ([type]) => type === 'keydown'
    );
    expect(keydownRemovals).toHaveLength(1);
    removeListener.mockRestore();
  });

  it('moves focus into the content on open without waiting for a later frame', () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogTitle>Navigation</DialogTitle>
          <button type="button">Dashboard</button>
        </DialogContent>
      </Dialog>
    );

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Dashboard' })
    );
  });

  it('leaves focus where the content already put it', () => {
    function SelfFocusingField() {
      const ref = useRef<HTMLInputElement>(null);
      useEffect(() => {
        ref.current?.focus();
      }, []);
      return <input ref={ref} aria-label="API key" />;
    }

    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogTitle>Navigation</DialogTitle>
          <button type="button">Dashboard</button>
          <SelfFocusingField />
        </DialogContent>
      </Dialog>
    );

    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'API key' })
    );
  });

  it('wraps focus at both ends so Tab never leaves the dialog', () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogTitle>Navigation</DialogTitle>
          <button type="button">Dashboard</button>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    const first = screen.getByRole('button', { name: 'Dashboard' });
    const last = screen.getByRole('button', { name: 'Close dialog' });

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('returns focus to the control the dialog was opened over', () => {
    function OpenerAndDialog({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Share</button>
          <Dialog open={open} onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Verify</DialogTitle>
              <input aria-label="Code" />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<OpenerAndDialog open={false} />);
    const opener = screen.getByRole('button', { name: 'Share' });
    opener.focus();

    rerender(<OpenerAndDialog open />);
    rerender(<OpenerAndDialog open={false} />);

    expect(document.activeElement).toBe(opener);
  });

  it('falls back to the dialog underneath when focus was left on the body', () => {
    function StackedDialogs({ topOpen }: { topOpen: boolean }) {
      return (
        <>
          <Dialog open onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Share</DialogTitle>
              <button type="button">Anyone with the link</button>
            </DialogContent>
          </Dialog>
          <Dialog open={topOpen} onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Verify</DialogTitle>
              <input aria-label="Code" />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<StackedDialogs topOpen={false} />);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    rerender(<StackedDialogs topOpen />);
    rerender(<StackedDialogs topOpen={false} />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('falls back to the dialog underneath when the opener is gone by close', () => {
    function StackedDialogs({
      topOpen,
      showOpener,
    }: {
      topOpen: boolean;
      showOpener: boolean;
    }) {
      return (
        <>
          <Dialog open onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Share</DialogTitle>
              {showOpener && (
                <button type="button">Anyone with the link</button>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={topOpen} onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Verify</DialogTitle>
              <input aria-label="Code" />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<StackedDialogs topOpen={false} showOpener />);
    screen.getByRole('button', { name: 'Anyone with the link' }).focus();

    rerender(<StackedDialogs topOpen showOpener />);
    rerender(<StackedDialogs topOpen showOpener={false} />);
    rerender(<StackedDialogs topOpen={false} showOpener={false} />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('skips a control that disabled itself while the dialog was open', () => {
    const { rerender } = render(<ShareThenVerify topOpen={false} />);
    screen.getByRole('button', { name: 'Anyone with the link' }).focus();

    rerender(<ShareThenVerify topOpen />);
    rerender(<ShareThenVerify topOpen shareDisabled />);
    rerender(<ShareThenVerify topOpen={false} shareDisabled />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('skips a control the platform reports as invisible', () => {
    const { rerender } = render(<ShareThenVerify topOpen={false} />);
    const opener = screen.getByRole('button', { name: 'Anyone with the link' });
    opener.focus();

    rerender(<ShareThenVerify topOpen />);
    // jsdom does no layout and ships no checkVisibility, so the only way to state
    // "the platform says this is not rendered" is to supply the API it lacks.
    opener.checkVisibility = () => false;
    rerender(<ShareThenVerify topOpen={false} />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('falls back to the topmost dialog still open, not the bottom one', () => {
    function ThreeDialogs({ topOpen }: { topOpen: boolean }) {
      return (
        <>
          <Dialog open onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Bottom</DialogTitle>
            </DialogContent>
          </Dialog>
          <Dialog open onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Middle</DialogTitle>
            </DialogContent>
          </Dialog>
          <Dialog open={topOpen} onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Top</DialogTitle>
              <input aria-label="Code" />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<ThreeDialogs topOpen={false} />);
    (document.activeElement as HTMLElement).blur();

    rerender(<ThreeDialogs topOpen />);
    rerender(<ThreeDialogs topOpen={false} />);

    expect(document.activeElement).toBe(
      screen.getByText('Middle').closest('[role="dialog"]')
    );
  });

  it('renders a right-side drawer when side="right"', () => {
    render(
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent side="right">
          <DialogTitle>Entry details</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('right-0');
    expect(dialog.className).toContain('inset-y-0');
  });
});

describe('Dialog body scroll lock', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  function StackedDialogs({
    bottomOpen,
    topOpen,
  }: {
    bottomOpen: boolean;
    topOpen: boolean;
  }) {
    return (
      <>
        <Dialog open={bottomOpen} onOpenChange={vi.fn()}>
          <DialogContent>
            <DialogTitle>Settings</DialogTitle>
          </DialogContent>
        </Dialog>
        <Dialog open={topOpen} onOpenChange={vi.fn()}>
          <DialogContent>
            <DialogTitle>Create key</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  it('restores the overflow the page had before the dialog opened', () => {
    document.body.style.overflow = 'scroll';

    const { rerender } = render(<StackedDialogs bottomOpen topOpen={false} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<StackedDialogs bottomOpen={false} topOpen={false} />);

    expect(document.body.style.overflow).toBe('scroll');
  });

  it('keeps the page locked when the dialog underneath closes first', () => {
    const { rerender } = render(<StackedDialogs bottomOpen topOpen={false} />);
    rerender(<StackedDialogs bottomOpen topOpen />);

    rerender(<StackedDialogs bottomOpen={false} topOpen />);

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('releases the page only once the last dialog closes', () => {
    const { rerender } = render(<StackedDialogs bottomOpen topOpen={false} />);
    rerender(<StackedDialogs bottomOpen topOpen />);
    rerender(<StackedDialogs bottomOpen={false} topOpen />);

    rerender(<StackedDialogs bottomOpen={false} topOpen={false} />);

    expect(document.body.style.overflow).toBe('');
  });
});
