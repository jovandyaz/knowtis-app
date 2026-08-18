import { useEffect, useRef } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './Dialog';

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
