import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { X } from 'lucide-react';

import { cn } from '../utils';

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  titleId: string;
  descriptionId: string;
  titlePresent: boolean;
  descriptionPresent: boolean;
  setTitlePresent: (present: boolean) => void;
  setDescriptionPresent: (present: boolean) => void;
}

const openDialogStack: symbol[] = [];

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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
        triggerRef,
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

interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  asChild?: boolean;
}

function DialogTrigger({
  children,
  className,
  asChild,
  ...props
}: DialogTriggerProps) {
  const { onOpenChange, triggerRef } = useDialogContext();

  if (
    asChild &&
    typeof children === 'object' &&
    children !== null &&
    'type' in children
  ) {
    const child = children as ReactElement<{
      onClick?: (e: React.MouseEvent) => void;
    }>;
    return cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        onOpenChange(true);
        child.props.onClick?.(e);
      },
    });
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => onOpenChange(true)}
      className={cn('cursor-pointer', className)}
      {...props}
    >
      {children}
    </button>
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
    triggerRef,
    titleId,
    descriptionId,
    titlePresent,
    descriptionPresent,
  } = useDialogContext();
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const escapeToken = useRef(Symbol('dialog-escape'));

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
    if (!open) {
      return;
    }
    const token = escapeToken.current;
    openDialogStack.push(token);
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      if (openDialogStack[openDialogStack.length - 1] !== token) {
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      const index = openDialogStack.indexOf(token);
      if (index !== -1) {
        openDialogStack.splice(index, 1);
      }
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const trigger = triggerRef.current;

      return () => {
        document.body.style.overflow = originalOverflow;
        if (previousActiveElement.current instanceof HTMLElement) {
          previousActiveElement.current.focus();
        } else if (trigger) {
          trigger.focus();
        }
      };
    }
    return;
  }, [open, triggerRef]);

  // DialogPortal renders null until its own mount effect runs, so the content node
  // does not exist yet on the commit that opens the dialog — hence keying off the node.
  useEffect(() => {
    if (!open || !contentNode) {
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
    />
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
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
