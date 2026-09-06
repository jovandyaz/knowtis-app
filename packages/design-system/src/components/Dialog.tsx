import {
  createContext,
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

interface DialogSemanticsContextValue {
  descriptionPresent: boolean;
  setDescriptionPresent: (present: boolean) => void;
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

  return (
    <DialogSemanticsContext.Provider
      value={{
        descriptionPresent,
        setDescriptionPresent,
      }}
    >
      <DialogPrimitive.Root
        {...(open === undefined ? {} : { open })}
        {...(onOpenChange === undefined ? {} : { onOpenChange })}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogSemanticsContext.Provider>
  );
}

function canRestoreFocus(element: HTMLElement): boolean {
  if (
    element === document.body ||
    !element.isConnected ||
    element.hasAttribute('disabled')
  ) {
    return false;
  }
  return (
    typeof element.checkVisibility !== 'function' || element.checkVisibility()
  );
}

type RadixDialogContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
>;
type DialogAutoFocusEvent = Parameters<
  NonNullable<RadixDialogContentProps['onOpenAutoFocus']>
>[0];

interface DialogContentProps extends Omit<
  RadixDialogContentProps,
  'children' | 'className'
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
  const { descriptionPresent } = useDialogSemantics();
  const openerRef = useRef<HTMLElement | null>(null);

  const handleOpenAutoFocus = (event: DialogAutoFocusEvent) => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    onOpenAutoFocus?.(event);
  };

  const handleCloseAutoFocus = (event: DialogAutoFocusEvent) => {
    onCloseAutoFocus?.(event);
    const opener = openerRef.current;
    openerRef.current = null;
    if (event.defaultPrevented) {
      return;
    }

    if (opener && canRestoreFocus(opener)) {
      event.preventDefault();
      opener.focus();
    }
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
          'animate-in fade-in-0'
        )}
      />
      <DialogPrimitive.Content
        {...(!descriptionPresent ? { 'aria-describedby': undefined } : {})}
        {...props}
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
