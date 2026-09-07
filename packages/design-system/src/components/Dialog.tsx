import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { DIALOG_SIDE, type DialogSide } from '../constants/dialog';
import { cn } from '../utils';

const DIALOG_CONTENT_SELECTOR =
  '[data-knowtis-dialog-content], [role="dialog"][data-state]';
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface DialogFocusOrigin {
  opener: HTMLElement | null;
  parentDialog: HTMLElement | null;
}

interface DialogSemanticsContextValue {
  descriptionPresent: boolean;
  setDescriptionPresent: (present: boolean) => void;
  prepareContentCycle: (overlay: HTMLElement) => void;
  registerContent: (content: HTMLElement) => void;
  takeFocusOrigin: (content: HTMLElement | null) => DialogFocusOrigin | null;
}

const DialogSemanticsContext =
  createContext<DialogSemanticsContextValue | null>(null);

function useDialogSemantics() {
  const context = useContext(DialogSemanticsContext);
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

function Dialog({ children, open, onOpenChange }: DialogProps) {
  const [descriptionPresent, setDescriptionPresent] = useState(false);
  const nextCycleIdRef = useRef(0);
  const latestCycleIdRef = useRef(0);
  const pendingCycleIdRef = useRef<number | null>(null);
  const focusOriginsRef = useRef(new Map<number, DialogFocusOrigin>());
  const preparedOverlaysRef = useRef(new WeakSet<HTMLElement>());
  const contentCyclesRef = useRef(new WeakMap<HTMLElement, number>());

  const captureFocusOrigin = useCallback(
    (cycleId: number, content: HTMLElement | null) => {
      if (focusOriginsRef.current.has(cycleId)) {
        return;
      }

      const opener =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (content?.contains(opener)) {
        return;
      }
      focusOriginsRef.current.set(cycleId, {
        opener,
        parentDialog:
          opener?.closest<HTMLElement>(DIALOG_CONTENT_SELECTOR) ?? null,
      });
    },
    []
  );

  const createCycle = useCallback(() => {
    const cycleId = ++nextCycleIdRef.current;
    latestCycleIdRef.current = cycleId;
    return cycleId;
  }, []);

  const prepareContentCycle = useCallback(
    (overlay: HTMLElement) => {
      if (preparedOverlaysRef.current.has(overlay)) {
        return;
      }
      preparedOverlaysRef.current.add(overlay);
      if (pendingCycleIdRef.current === null) {
        const cycleId = createCycle();
        pendingCycleIdRef.current = cycleId;
        captureFocusOrigin(cycleId, null);
      }
    },
    [captureFocusOrigin, createCycle]
  );

  const registerContent = useCallback(
    (content: HTMLElement) => {
      if (contentCyclesRef.current.has(content)) {
        return;
      }
      const cycleId = pendingCycleIdRef.current ?? createCycle();
      pendingCycleIdRef.current = null;
      captureFocusOrigin(cycleId, content);
      contentCyclesRef.current.set(content, cycleId);
    },
    [captureFocusOrigin, createCycle]
  );

  const takeFocusOrigin = useCallback((content: HTMLElement | null) => {
    if (!content) {
      return null;
    }

    const cycleId = contentCyclesRef.current.get(content);
    if (cycleId === undefined) {
      return null;
    }
    contentCyclesRef.current.delete(content);
    const origin = focusOriginsRef.current.get(cycleId) ?? null;
    focusOriginsRef.current.delete(cycleId);
    if (cycleId !== latestCycleIdRef.current) {
      return null;
    }
    return origin;
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      const pendingCycleId = pendingCycleIdRef.current;
      if (pendingCycleId !== null) {
        focusOriginsRef.current.delete(pendingCycleId);
        pendingCycleIdRef.current = null;
      }
      onOpenChange?.(false);
      return;
    }

    const previousPendingCycleId = pendingCycleIdRef.current;
    if (previousPendingCycleId !== null) {
      focusOriginsRef.current.delete(previousPendingCycleId);
    }
    const cycleId = createCycle();
    pendingCycleIdRef.current = cycleId;
    captureFocusOrigin(cycleId, null);
    onOpenChange?.(true);
  };

  return (
    <DialogSemanticsContext.Provider
      value={{
        descriptionPresent,
        setDescriptionPresent,
        prepareContentCycle,
        registerContent,
        takeFocusOrigin,
      }}
    >
      <DialogPrimitive.Root
        {...(open === undefined ? {} : { open })}
        onOpenChange={handleOpenChange}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogSemanticsContext.Provider>
  );
}

function isDisabled(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled')) {
    return true;
  }
  try {
    return element.matches(':disabled');
  } catch {
    return false;
  }
}

function canRestoreFocus(element: HTMLElement): boolean {
  if (
    element === document.body ||
    !element.isConnected ||
    isDisabled(element)
  ) {
    return false;
  }
  return (
    typeof element.checkVisibility !== 'function' || element.checkVisibility()
  );
}

function focusParentDialog(parentDialog: HTMLElement | null) {
  if (!parentDialog?.isConnected) {
    return;
  }

  const target = Array.from(
    parentDialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).find(canRestoreFocus);
  (target ?? parentDialog).focus();
}

type RadixDialogContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
>;
type DialogAutoFocusEvent = Parameters<
  NonNullable<RadixDialogContentProps['onOpenAutoFocus']>
>[0];

interface DialogContentProps extends Omit<
  RadixDialogContentProps,
  'asChild' | 'children' | 'className'
> {
  children: ReactNode;
  className?: string;
  side?: DialogSide;
  /** Accessible name of the close control; the caller owns its translation. */
  closeLabel: string;
}

function DialogContent({
  className,
  children,
  side = DIALOG_SIDE.CENTER,
  closeLabel,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  const {
    descriptionPresent,
    prepareContentCycle,
    registerContent,
    takeFocusOrigin,
  } = useDialogSemantics();

  // Overlay commits before Content descendants can move focus in layout effects.
  const handleOverlayRef = useCallback(
    (overlay: HTMLDivElement | null) => {
      if (overlay) {
        prepareContentCycle(overlay);
      }
    },
    [prepareContentCycle]
  );

  const handleContentRef = useCallback(
    (content: HTMLDivElement | null) => {
      if (content) {
        registerContent(content);
      }
    },
    [registerContent]
  );

  const handleOpenAutoFocus = (event: DialogAutoFocusEvent) => {
    onOpenAutoFocus?.(event);
  };

  const handleCloseAutoFocus = (event: DialogAutoFocusEvent) => {
    onCloseAutoFocus?.(event);
    const content = event.target instanceof HTMLElement ? event.target : null;
    const origin = takeFocusOrigin(content);
    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    if (origin?.opener && canRestoreFocus(origin.opener)) {
      origin.opener.focus();
      return;
    }
    focusParentDialog(origin?.parentDialog ?? null);
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        ref={handleOverlayRef}
        className={cn(
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
          'animate-in fade-in-0'
        )}
      />
      <DialogPrimitive.Content
        ref={handleContentRef}
        {...(!descriptionPresent ? { 'aria-describedby': undefined } : {})}
        {...props}
        data-knowtis-dialog-content=""
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        className={cn(
          'fixed z-50 grid w-full gap-4 border border-(--border) bg-(--card) shadow-lg duration-200',
          side === DIALOG_SIDE.CENTER && [
            'md:left-1/2 md:top-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6',
            'md:animate-in md:fade-in-0 md:zoom-in-95 md:slide-in-from-left-1/2 md:slide-in-from-top-[48%]',
            'max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:rounded-t-xl max-md:border-b-0 max-md:p-5 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]',
            'max-md:animate-in max-md:fade-in-0 max-md:slide-in-from-bottom-full',
          ],
          side === DIALOG_SIDE.FULL && [
            'inset-0 h-full max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-0 p-0',
            'animate-in fade-in-0',
          ],
          side === DIALOG_SIDE.RIGHT && [
            'inset-y-0 right-0 h-full max-w-md content-start overflow-y-auto border-l p-6',
            'animate-in fade-in-0 slide-in-from-right',
          ],
          className
        )}
      >
        {side === DIALOG_SIDE.CENTER ? (
          <div className="mb-1 flex justify-center md:hidden">
            <div className="h-1 w-8 rounded-full bg-(--muted-foreground)/30" />
          </div>
        ) : null}
        {children}
        <DialogPrimitive.Close
          type="button"
          className="absolute right-4 top-4 max-md:top-5 rounded-sm opacity-70 ring-offset-(--background) transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2"
          aria-label={closeLabel}
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
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

type DialogTitleProps = Omit<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>,
  'id'
>;

function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      {...props}
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className
      )}
    />
  );
}

type DialogDescriptionProps = Omit<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>,
  'id'
>;

function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  const { setDescriptionPresent } = useDialogSemantics();
  useEffect(() => {
    setDescriptionPresent(true);
    return () => setDescriptionPresent(false);
  }, [setDescriptionPresent]);

  return (
    <DialogPrimitive.Description
      {...props}
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
