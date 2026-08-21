import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface MobileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}

export function MobileSheet({
  isOpen,
  onClose,
  label,
  children,
}: MobileSheetProps) {
  const { t } = useTranslation('common');
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AnimatePresence>
        {isOpen && (
          // forceMount hands unmounting to AnimatePresence so the exit animation can run.
          <DialogPrimitive.Portal key="mobile-sheet" forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              asChild
              aria-describedby={undefined}
              onOpenAutoFocus={() => {
                openerRef.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
              }}
              // Radix restores focus to its own Dialog.Trigger; this sheet is opened
              // from the bottom nav instead, so the opener has to be restored by hand.
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                openerRef.current?.focus();
              }}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-(--border) bg-(--background) pb-[env(safe-area-inset-bottom)]"
              >
                <DialogPrimitive.Title className="sr-only">
                  {label}
                </DialogPrimitive.Title>

                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                  <div className="h-1 w-10 rounded-full bg-(--muted-foreground)/30 mx-auto" />
                </div>

                <div className="max-h-[70vh] overflow-y-auto overscroll-contain px-5 pb-6">
                  {children}
                </div>

                <DialogPrimitive.Close
                  className="absolute right-4 top-4 rounded-full p-1.5 text-(--muted-foreground)/50 transition-colors active:text-(--muted-foreground)"
                  aria-label={t('labels.close')}
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
