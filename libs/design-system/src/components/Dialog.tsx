import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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
      value={{ open, onOpenChange: handleOpenChange, triggerRef }}
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
}

function DialogContent({ className, children, ...props }: DialogContentProps) {
  const { open, onOpenChange, triggerRef } = useDialogContext();
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!contentRef.current) {
      return [];
    }
    return Array.from(
      contentRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        return;
      }

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
    [getFocusableElements, onOpenChange]
  );

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;

      requestAnimationFrame(() => {
        const focusableElements = getFocusableElements();
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        } else {
          contentRef.current?.focus();
        }
      });

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
  }, [open, getFocusableElements, triggerRef]);

  if (!open) {
    return null;
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-(--border) bg-(--card) p-6 shadow-lg duration-200',
          'animate-in fade-in-0 zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%]',
          'rounded-lg',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
        <button
          type="button"
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-(--background) transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2"
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
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  id,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      id={id}
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  id,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      id={id}
      className={cn('text-sm text-(--muted-foreground)', className)}
      {...props}
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
