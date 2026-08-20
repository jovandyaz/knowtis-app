import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

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

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="sheet-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="sheet-content"
            role="dialog"
            aria-label={label}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-(--border) bg-(--background) pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="h-1 w-10 rounded-full bg-(--muted-foreground)/30 mx-auto" />
            </div>

            <div className="px-5 pb-6">{children}</div>

            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-1.5 text-(--muted-foreground)/50 transition-colors active:text-(--muted-foreground)"
              aria-label={t('labels.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
