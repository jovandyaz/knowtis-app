import {
  createRef,
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
      <DialogContent closeLabel="Close dialog">
        <DialogHeader>
          <DialogTitle>Delete note</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
  return onOpenChange;
}

type InvalidOpenerMode = 'removed' | 'disabled' | 'disabled-fieldset';

function InvalidNestedOpener({ mode }: { mode: InvalidOpenerMode }) {
  const [upperOpen, setUpperOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const opener = (
    <button
      type="button"
      disabled={mode === 'disabled' && invalid}
      onClick={() => setUpperOpen(true)}
    >
      Open upper
    </button>
  );

  return (
    <>
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent closeLabel="Close lower dialog">
          <DialogTitle>Lower</DialogTitle>
          {mode === 'removed' && invalid ? null : mode ===
            'disabled-fieldset' ? (
            <fieldset disabled={invalid}>{opener}</fieldset>
          ) : (
            opener
          )}
          <button type="button">Lower fallback</button>
        </DialogContent>
      </Dialog>
      <Dialog open={upperOpen} onOpenChange={setUpperOpen}>
        <DialogContent closeLabel="Close upper dialog">
          <DialogTitle>Upper</DialogTitle>
          <input aria-label="Upper field" />
          <button
            type="button"
            onClick={() => {
              setInvalid(true);
              setUpperOpen(false);
            }}
          >
            Finish
          </button>
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

  it('lets a consumer choose initial focus through the cancelable Radix event', () => {
    const onOpenAutoFocus = vi.fn();

    function CustomInitialFocus() {
      const chosen = useRef<HTMLButtonElement>(null);
      return (
        <Dialog open onOpenChange={vi.fn()}>
          <DialogContent
            closeLabel="Close dialog"
            onOpenAutoFocus={(event) => {
              onOpenAutoFocus();
              event.preventDefault();
              chosen.current?.focus();
            }}
          >
            <DialogTitle>Choose focus</DialogTitle>
            <button type="button">Default target</button>
            <button ref={chosen} type="button">
              Chosen target
            </button>
          </DialogContent>
        </Dialog>
      );
    }

    render(<CustomInitialFocus />);

    expect(onOpenAutoFocus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Chosen target' })).toHaveFocus();
  });

  it('keeps its title label and omits an absent optional description', () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent closeLabel="Close dialog">
          <DialogTitle>Title only</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Title only' });
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
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

  it('operates a portaled Radix menu without dismissing the dialog', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent closeLabel="Close dialog">
          <DialogTitle>Settings</DialogTitle>
          <DropdownMenu>
            <DropdownMenuTrigger>Model</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={onSelect}>Sonnet</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const trigger = screen.getByRole('button', { name: 'Model' });
    await user.click(trigger);
    const menu = screen.getByRole('menu');
    expect(document.body).toContainElement(menu);
    expect(dialog).not.toContainElement(menu);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Sonnet' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(
      screen.getByRole('dialog', { name: 'Settings' })
    ).toBeInTheDocument();
  });

  it('removes the Escape listener when closed', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent closeLabel="Close dialog">
          <DialogTitle>Hidden</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes only the topmost dialog on Escape when dialogs are stacked', () => {
    const onOuterChange = vi.fn();
    const onInnerChange = vi.fn();
    render(
      <>
        <Dialog open onOpenChange={onOuterChange}>
          <DialogContent closeLabel="Close dialog">
            <DialogTitle>Outer</DialogTitle>
          </DialogContent>
        </Dialog>
        <Dialog open onOpenChange={onInnerChange}>
          <DialogContent closeLabel="Close dialog">
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
        <DialogContent closeLabel="Close dialog">
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
        <DialogContent closeLabel="Close dialog">
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

  it('recaptures focus when background code focuses outside the modal', () => {
    render(
      <>
        <button type="button">Background action</button>
        <Dialog open onOpenChange={vi.fn()}>
          <DialogContent closeLabel="Close dialog">
            <DialogTitle>Verify</DialogTitle>
            <input aria-label="Code" />
          </DialogContent>
        </Dialog>
      </>
    );

    const code = screen.getByRole('textbox', { name: 'Code' });
    const background = screen.getByRole('button', {
      name: 'Background action',
      hidden: true,
    });
    background.focus();

    expect(code).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Background action' })
    ).toBeNull();
  });

  it('wraps focus at both ends so Tab never leaves the dialog', () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent closeLabel="Close dialog">
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

  it('composes consumer keydown with forward and backward focus looping', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    render(
      <>
        <button type="button">Background action</button>
        <Dialog open onOpenChange={vi.fn()}>
          <DialogContent closeLabel="Close dialog" onKeyDown={onKeyDown}>
            <DialogTitle>Navigation</DialogTitle>
            <button type="button">First action</button>
          </DialogContent>
        </Dialog>
      </>
    );

    const first = screen.getByRole('button', { name: 'First action' });
    const close = screen.getByRole('button', { name: 'Close dialog' });
    close.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    expect(
      onKeyDown.mock.calls.filter(([event]) => event.key === 'Tab')
    ).toHaveLength(2);
  });

  it('lets a consumer cancel Escape without replacing focus containment', () => {
    const onOpenChange = vi.fn();
    const onEscapeKeyDown = vi.fn((event: Event) => event.preventDefault());
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent
          closeLabel="Close dialog"
          onEscapeKeyDown={onEscapeKeyDown}
        >
          <DialogTitle>Protected action</DialogTitle>
          <button type="button">Continue</button>
        </DialogContent>
      </Dialog>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
  });

  it('lets a consumer cancel an outside pointer dismissal', async () => {
    const onOpenChange = vi.fn();
    const onPointerDownOutside = vi.fn((event: Event) =>
      event.preventDefault()
    );
    render(
      <>
        <button type="button">Background action</button>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent
            closeLabel="Close dialog"
            onPointerDownOutside={onPointerDownOutside}
          >
            <DialogTitle>Stay open</DialogTitle>
            <button type="button">Inside action</button>
          </DialogContent>
        </Dialog>
      </>
    );

    await waitFor(() => expect(document.body.style.pointerEvents).toBe('none'));
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Background action', hidden: true })
    );

    expect(onPointerDownOutside).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Stay open' })
    ).toBeInTheDocument();
  });

  it('returns focus to the control the dialog was opened over', async () => {
    function OpenerAndDialog({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Share</button>
          <Dialog open={open} onOpenChange={vi.fn()}>
            <DialogContent closeLabel="Close dialog">
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

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('restores the opener after an uncontrolled open and close', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog onOpenChange={onOpenChange}>
        <DialogPrimitive.Trigger>
          Open uncontrolled dialog
        </DialogPrimitive.Trigger>
        <DialogContent closeLabel="Close dialog">
          <DialogTitle>Uncontrolled dialog</DialogTitle>
          <input aria-label="Uncontrolled field" />
        </DialogContent>
      </Dialog>
    );
    const opener = screen.getByRole('button', {
      name: 'Open uncontrolled dialog',
    });

    await user.click(opener);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('retains the opener when a controlled close request is rejected', async () => {
    function RejectingDialog() {
      const [open, setOpen] = useState(false);
      const [rejectClose, setRejectClose] = useState(true);
      const [contentGeneration, setContentGeneration] = useState(0);

      const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && rejectClose) {
          setContentGeneration((generation) => generation + 1);
          return;
        }
        setOpen(nextOpen);
      };

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open controlled dialog
          </button>
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent key={contentGeneration} closeLabel="Close dialog">
              <DialogTitle>Controlled dialog</DialogTitle>
              <button type="button" onClick={() => setRejectClose(false)}>
                Allow close
              </button>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const user = userEvent.setup();
    render(<RejectingDialog />);
    const opener = screen.getByRole('button', {
      name: 'Open controlled dialog',
    });

    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(
      screen.getByRole('dialog', { name: 'Controlled dialog' })
    ).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await user.click(screen.getByRole('button', { name: 'Allow close' }));
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('restores the original opener when a child focuses itself before Radix autofocus', async () => {
    function SelfFocusingField() {
      const field = useRef<HTMLInputElement>(null);
      useEffect(() => {
        field.current?.focus();
      }, []);
      return <input ref={field} aria-label="Self-focused field" />;
    }

    function SelfFocusingDialog() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent closeLabel="Close dialog">
              <DialogTitle>Self focus</DialogTitle>
              <SelfFocusingField />
              <button type="button" onClick={() => setOpen(false)}>
                Finish
              </button>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const user = userEvent.setup();
    render(<SelfFocusingDialog />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });

    await user.click(opener);
    expect(
      screen.getByRole('textbox', { name: 'Self-focused field' })
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('restores the original opener when a child focuses itself in a layout effect', async () => {
    function LayoutFocusingField() {
      const field = useRef<HTMLInputElement>(null);
      useLayoutEffect(() => {
        field.current?.focus();
      }, []);
      return <input ref={field} aria-label="Layout-focused field" />;
    }

    function LayoutFocusingDialog() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open layout dialog
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent closeLabel="Close dialog">
              <DialogTitle>Layout focus</DialogTitle>
              <LayoutFocusingField />
              <button type="button" onClick={() => setOpen(false)}>
                Finish layout dialog
              </button>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const user = userEvent.setup();
    render(<LayoutFocusingDialog />);
    const opener = screen.getByRole('button', { name: 'Open layout dialog' });

    await user.click(opener);
    expect(
      screen.getByRole('textbox', { name: 'Layout-focused field' })
    ).toHaveFocus();
    await user.click(
      screen.getByRole('button', { name: 'Finish layout dialog' })
    );

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps a reopened cycle origin after the prior close autofocus runs', async () => {
    function RapidReopenDialog({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">First opener</button>
          <button type="button">Second opener</button>
          <Dialog open={open} onOpenChange={vi.fn()}>
            <DialogContent closeLabel="Close dialog">
              <DialogTitle>Rapid reopen</DialogTitle>
              <input aria-label="Dialog field" />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<RapidReopenDialog open={false} />);
    const firstOpener = screen.getByRole('button', { name: 'First opener' });
    const secondOpener = screen.getByRole('button', { name: 'Second opener' });

    firstOpener.focus();
    rerender(<RapidReopenDialog open />);
    rerender(<RapidReopenDialog open={false} />);
    secondOpener.focus();
    rerender(<RapidReopenDialog open />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('textbox', { name: 'Dialog field' })).toHaveFocus();

    rerender(<RapidReopenDialog open={false} />);
    await waitFor(() => expect(secondOpener).toHaveFocus());
  });

  it('keeps the live origin through StrictMode synthetic cleanup', async () => {
    const strictCleanup = vi.fn();

    function StrictLifecycleProbe() {
      useEffect(() => () => strictCleanup(), []);
      return null;
    }

    function StrictDialog() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <StrictLifecycleProbe />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent closeLabel="Close dialog">
              <DialogTitle>Strict lifecycle</DialogTitle>
              <input aria-label="Strict field" />
              <button type="button" onClick={() => setOpen(false)}>
                Finish strict dialog
              </button>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const user = userEvent.setup();
    render(<button type="button">Strict opener</button>);
    const opener = screen.getByRole('button', { name: 'Strict opener' });
    opener.focus();
    render(
      <StrictMode>
        <StrictDialog />
      </StrictMode>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(strictCleanup).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Strict field' })).toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: 'Finish strict dialog' })
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('never uses an unrelated role dialog as a parent fallback', async () => {
    function UnrelatedDialogHarness() {
      const [open, setOpen] = useState(false);
      const [showOpener, setShowOpener] = useState(true);
      return (
        <>
          <div role="dialog" aria-label="Unrelated dialog" data-state="open">
            {showOpener ? (
              <button type="button" onClick={() => setOpen(true)}>
                Open owned dialog
              </button>
            ) : null}
            <button type="button">Unrelated fallback</button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent closeLabel="Close dialog">
              <DialogTitle>Owned dialog</DialogTitle>
              <button
                type="button"
                onClick={() => {
                  setShowOpener(false);
                  setOpen(false);
                }}
              >
                Finish owned dialog
              </button>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const user = userEvent.setup();
    render(<UnrelatedDialogHarness />);
    const fallback = screen.getByRole('button', {
      name: 'Unrelated fallback',
    });
    const focus = vi.spyOn(fallback, 'focus');

    await user.click(screen.getByRole('button', { name: 'Open owned dialog' }));
    await user.click(
      screen.getByRole('button', { name: 'Finish owned dialog' })
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(focus).not.toHaveBeenCalled();
    expect(fallback).not.toHaveFocus();
  });

  it('uses a consumer close-autofocus target instead of the captured opener', async () => {
    function CloseTargetHarness({ open }: { open: boolean }) {
      const logicalTarget = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button">Opener</button>
          <button ref={logicalTarget} type="button">
            Logical target
          </button>
          <Dialog open={open} onOpenChange={vi.fn()}>
            <DialogContent
              closeLabel="Close dialog"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                logicalTarget.current?.focus();
              }}
            >
              <DialogTitle>Complete</DialogTitle>
              <button type="button">Finish</button>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<CloseTargetHarness open={false} />);
    screen.getByRole('button', { name: 'Opener' }).focus();
    rerender(<CloseTargetHarness open />);
    rerender(<CloseTargetHarness open={false} />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Logical target' })
      ).toHaveFocus()
    );
  });

  it('does not restore an opener the platform reports as invisible', async () => {
    function InvisibleOpener({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Open dialog</button>
          <Dialog open={open} onOpenChange={vi.fn()}>
            <DialogContent closeLabel="Close dialog">
              <DialogTitle>Hide opener</DialogTitle>
              <input aria-label="Dialog field" />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<InvisibleOpener open={false} />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    rerender(<InvisibleOpener open />);
    opener.checkVisibility = () => false;
    const focus = vi.spyOn(opener, 'focus');
    rerender(<InvisibleOpener open={false} />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(focus).not.toHaveBeenCalled();
  });

  it('recovers inside the scope when the focused control is detached', async () => {
    function DetachingControl() {
      const [shown, setShown] = useState(true);
      return (
        <Dialog open onOpenChange={vi.fn()}>
          <DialogContent closeLabel="Close dialog">
            <DialogTitle>Detach focus</DialogTitle>
            {shown ? (
              <button type="button" onClick={() => setShown(false)}>
                Remove me
              </button>
            ) : null}
            <button type="button">Remaining action</button>
          </DialogContent>
        </Dialog>
      );
    }

    const user = userEvent.setup();
    render(<DetachingControl />);
    await user.click(screen.getByRole('button', { name: 'Remove me' }));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: 'Detach focus' });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it('keeps the top scope focused when the lower dialog closes first', async () => {
    function Stack({ lowerOpen }: { lowerOpen: boolean }) {
      return (
        <>
          <Dialog open={lowerOpen} onOpenChange={vi.fn()}>
            <DialogContent closeLabel="Close lower dialog">
              <DialogTitle>Lower</DialogTitle>
              <button type="button">Lower action</button>
            </DialogContent>
          </Dialog>
          <Dialog open onOpenChange={vi.fn()}>
            <DialogContent closeLabel="Close upper dialog">
              <DialogTitle>Upper</DialogTitle>
              <input aria-label="Upper field" />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { rerender } = render(<Stack lowerOpen />);
    const upperField = screen.getByRole('textbox', {
      name: 'Upper field',
      hidden: true,
    });
    upperField.focus();
    rerender(<Stack lowerOpen={false} />);

    await waitFor(() => expect(upperField).toHaveFocus());
  });

  it('focuses the parent dialog when a nested opener is removed before close', async () => {
    const user = userEvent.setup();
    render(<InvalidNestedOpener mode="removed" />);

    await user.click(screen.getByRole('button', { name: 'Open upper' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Lower fallback' })
      ).toHaveFocus()
    );
  });

  it('focuses the parent dialog when a nested opener is disabled before close', async () => {
    const user = userEvent.setup();
    render(<InvalidNestedOpener mode="disabled" />);

    await user.click(screen.getByRole('button', { name: 'Open upper' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Lower fallback' })
      ).toHaveFocus()
    );
  });

  it('focuses the parent dialog when a nested opener becomes fieldset-disabled', async () => {
    const user = userEvent.setup();
    render(<InvalidNestedOpener mode="disabled-fieldset" />);

    await user.click(screen.getByRole('button', { name: 'Open upper' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Lower fallback' })
      ).toHaveFocus()
    );
  });

  it('renders a right-side drawer when side="right"', () => {
    render(
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent side="right" closeLabel="Close dialog">
          <DialogTitle>Entry details</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('right-0');
    expect(dialog.className).toContain('inset-y-0');
  });

  it('fills the viewport when side="full"', () => {
    render(
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent side="full" closeLabel="Close dialog">
          <DialogTitle>Diagram</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('h-full');
    expect(dialog.className).toContain('max-w-none');
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
          <DialogContent closeLabel="Close dialog">
            <DialogTitle>Settings</DialogTitle>
          </DialogContent>
        </Dialog>
        <Dialog open={topOpen} onOpenChange={vi.fn()}>
          <DialogContent closeLabel="Close dialog">
            <DialogTitle>Create key</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  it('restores the overflow the page had before the dialog opened', () => {
    document.body.style.overflow = 'scroll';

    const { rerender } = render(<StackedDialogs bottomOpen topOpen={false} />);

    rerender(<StackedDialogs bottomOpen={false} topOpen={false} />);

    expect(document.body.style.overflow).toBe('scroll');
  });

  it('keeps the page locked when the dialog underneath closes first', () => {
    const { rerender } = render(<StackedDialogs bottomOpen topOpen={false} />);
    rerender(<StackedDialogs bottomOpen topOpen />);

    rerender(<StackedDialogs bottomOpen={false} topOpen />);

    expect(getComputedStyle(document.body).overflow).toBe('hidden');
  });

  it('releases the page only once the last dialog closes', () => {
    const { rerender } = render(<StackedDialogs bottomOpen topOpen={false} />);
    rerender(<StackedDialogs bottomOpen topOpen />);
    rerender(<StackedDialogs bottomOpen={false} topOpen />);

    rerender(<StackedDialogs bottomOpen={false} topOpen={false} />);

    expect(document.body.style.overflow).toBe('');
  });
});

describe('Dialog layout slots', () => {
  it('forwards a ref to the rendered header element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<DialogHeader ref={ref} data-testid="dialog-header" />);
    expect(ref.current).toBe(screen.getByTestId('dialog-header'));
  });

  it('forwards a ref to the rendered footer element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<DialogFooter ref={ref} data-testid="dialog-footer" />);
    expect(ref.current).toBe(screen.getByTestId('dialog-footer'));
  });
});
