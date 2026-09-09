import type { ReactNode } from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { TOUCH_TARGET_CLASS } from '../constants/touch-target';
import { cn } from '../utils/cn';

export interface RecordingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Accessible name for the close control; the design system ships no copy. */
  closeLabel: string;
  children: ReactNode;
  preventClose?: boolean;
  className?: string;
}

export function RecordingModal({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  preventClose = false,
  className,
}: RecordingModalProps) {
  const handleOpenChange = (value: boolean) => {
    if (preventClose && !value) {
      return;
    }
    onOpenChange(value);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
            'animate-overlay-fade',
            'motion-reduce:animate-none'
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            if (preventClose) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            if (preventClose) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (preventClose) {
              e.preventDefault();
            }
          }}
          className={cn(
            'fixed z-50 w-full',
            'bg-(--card)/80 backdrop-blur-xl',
            'border border-white/10',
            'shadow-xl',
            'md:left-1/2 md:top-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:p-6',
            'max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:rounded-t-2xl max-md:border-b-0 max-md:p-5 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]',
            'md:animate-overlay-pop md:motion-reduce:animate-none',
            'max-md:animate-sheet-rise max-md:motion-reduce:animate-none',
            className
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {title}
          </DialogPrimitive.Title>
          <div className="mb-3 flex justify-center md:hidden">
            <div className="h-1 w-8 rounded-full bg-(--muted-foreground)/30" />
          </div>
          {children}
          {!preventClose && (
            <DialogPrimitive.Close
              className={cn(
                TOUCH_TARGET_CLASS,
                'absolute right-4 top-4 max-md:top-5 inline-flex cursor-pointer items-center justify-center rounded-sm opacity-70 ring-offset-(--background) transition-opacity duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2'
              )}
              aria-label={closeLabel}
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

RecordingModal.displayName = 'RecordingModal';
