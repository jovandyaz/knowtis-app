import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { X } from 'lucide-react';

import { useEscapeDismiss } from '../hooks/useEscapeDismiss';
import { cn } from '../utils';

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  titlePresent: boolean;
  descriptionPresent: boolean;
  setTitlePresent: (present: boolean) => void;
  setDescriptionPresent: (present: boolean) => void;
}

// Stacked dialogs share one lock: a per-dialog capture reads 'hidden' off the
// dialog underneath, so closing bottom-first would restore 'hidden' for good.
let scrollLockCount = 0;
let overflowBeforeLock = '';

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

function releaseBodyScroll() {
  scrollLockCount -= 1;
  if (scrollLockCount === 0) {
    document.body.style.overflow = overflowBeforeLock;
  }
}

const DIALOG_ROLE_SELECTOR = '[role="dialog"]';

// A control that disables itself mid-action blurs to <body>, and a re-render can
// detach or hide it, so what held focus at open time may be unable to take it
// back — and `.focus()` on such a control silently strands focus on <body>.
function canTakeFocusBack(element: HTMLElement): boolean {
  if (!element.isConnected || element.hasAttribute('disabled')) {
    return false;
  }
  return (
    typeof element.checkVisibility !== 'function' || element.checkVisibility()
  );
}

function focusTargetAfterClose(previous: Element | null): HTMLElement | null {
  if (
    previous instanceof HTMLElement &&
    previous !== document.body &&
    canTakeFocusBack(previous)
  ) {
    return previous;
  }
  const stillOpen =
    document.querySelectorAll<HTMLElement>(DIALOG_ROLE_SELECTOR);
  return stillOpen[stillOpen.length - 1] ?? null;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('Dialog components must be used within a Dialog');
  }
  return context;
}

interface DialogProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function Dialog({ children, open: controlledOpen, onOpenChange }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [titlePresent, setTitlePresent] = useState(false);
  const [descriptionPresent, setDescriptionPresent] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DialogContext.Provider
      value={{
        open,
        onOpenChange: handleOpenChange,
        titleId,
        descriptionId,
        titlePresent,
        descriptionPresent,
        setTitlePresent,
        setDescriptionPresent,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

function DialogPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(children, document.body);
}

function DialogOverlay({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { open, onOpenChange } = useDialogContext();

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
        'animate-in fade-in-0',
        className
      )}
      onClick={() => onOpenChange(false)}
      aria-hidden="true"
      {...props}
    />
  );
}

interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  side?: 'center' | 'right';
}

function DialogContent({
  className,
  children,
  side = 'center',
  ...props
}: DialogContentProps) {
  const {
    open,
    onOpenChange,
    titleId,
    descriptionId,
    titlePresent,
    descriptionPresent,
  } = useDialogContext();
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const previousActiveElement = useRef<Element | null>(null);

  useEscapeDismiss(open, () => onOpenChange(false));

  const getFocusableElements = useCallback(() => {
    if (!contentNode) {
      return [];
    }
    return Array.from(
      contentNode.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  }, [contentNode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [getFocusableElements]
  );

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;

      lockBodyScroll();

      return () => {
        releaseBodyScroll();
        focusTargetAfterClose(previousActiveElement.current)?.focus();
      };
    }
    return;
  }, [open]);

  // DialogPortal renders null until its own mount effect runs, so the content node
  // does not exist yet on the commit that opens the dialog — hence keying off the node.
  // That extra commit lands after the content's own effects, so content that focused a
  // field of its own already holds focus here and must keep it.
  useEffect(() => {
    if (!open || !contentNode || contentNode.contains(document.activeElement)) {
      return;
    }
    const [firstFocusable] = getFocusableElements();
    (firstFocusable ?? contentNode).focus();
  }, [open, contentNode, getFocusableElements]);

  if (!open) {
    return null;
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the APG dialog pattern traps Tab on the dialog container itself */}
      <div
        ref={setContentNode}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titlePresent ? titleId : undefined}
        aria-describedby={descriptionPresent ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          'fixed z-50 grid w-full gap-4 border border-(--border) bg-(--card) shadow-lg duration-200',
          side === 'center' && [
            'md:left-1/2 md:top-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6',
            'md:animate-in md:fade-in-0 md:zoom-in-95 md:slide-in-from-left-1/2 md:slide-in-from-top-[48%]',
            'max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:rounded-t-xl max-md:border-b-0 max-md:p-5 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]',
            'max-md:animate-in max-md:fade-in-0 max-md:slide-in-from-bottom-full',
          ],
          side === 'right' && [
            'inset-y-0 right-0 h-full max-w-md content-start overflow-y-auto border-l p-6',
            'animate-in fade-in-0 slide-in-from-right',
          ],
          className
        )}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {side === 'center' ? (
          <div className="mb-1 flex justify-center md:hidden">
            <div className="h-1 w-8 rounded-full bg-(--muted-foreground)/30" />
          </div>
        ) : null}
        {children}
        <button
          type="button"
          className="absolute right-4 top-4 max-md:top-5 rounded-sm opacity-70 ring-offset-(--background) transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2"
          onClick={() => onOpenChange(false)}
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left',
        className
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLHeadingElement>, 'id'>) {
  const { titleId, setTitlePresent } = useDialogContext();
  useEffect(() => {
    setTitlePresent(true);
    return () => setTitlePresent(false);
  }, [setTitlePresent]);
  return (
    <h2
      {...props}
      id={titleId}
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className
      )}
    >
      {children}
    </h2>
  );
}

function DialogDescription({
  className,
  ...props
}: Omit<HTMLAttributes<HTMLParagraphElement>, 'id'>) {
  const { descriptionId, setDescriptionPresent } = useDialogContext();
  useEffect(() => {
    setDescriptionPresent(true);
    return () => setDescriptionPresent(false);
  }, [setDescriptionPresent]);
  return (
    <p
      {...props}
      id={descriptionId}
      className={cn('text-sm text-(--muted-foreground)', className)}
    />
  );
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
