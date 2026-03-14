import type { ReactNode } from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '../utils';

export interface RecordingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  preventClose?: boolean;
  className?: string;
}

export function RecordingModal({
  open,
  onOpenChange,
  title,
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
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
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
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'md:data-[state=open]:zoom-in-95 md:data-[state=open]:slide-in-from-left-1/2 md:data-[state=open]:slide-in-from-top-[48%]',
            'md:data-[state=closed]:zoom-out-95 md:data-[state=closed]:slide-out-to-left-1/2 md:data-[state=closed]:slide-out-to-top-[48%]',
            'max-md:data-[state=open]:slide-in-from-bottom-full',
            'max-md:data-[state=closed]:slide-out-to-bottom-full',
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
              className="absolute right-4 top-4 max-md:top-5 rounded-sm opacity-70 ring-offset-(--background) transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2"
              aria-label="Close"
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
