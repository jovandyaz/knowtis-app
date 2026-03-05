import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@knowtis/design-system';
import { useScrollDirection } from '@knowtis/shared-hooks';

import { CreateNoteDialog } from './CreateNoteDialog';

export function FloatingCreateButton() {
  const scrollDirection = useScrollDirection();
  const isVisible = scrollDirection !== 'down';

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed bottom-20 right-5 z-50 md:hidden">
          <CreateNoteDialog
            trigger={
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground',
                  'shadow-lg shadow-primary/25',
                  'active:scale-95 transition-transform'
                )}
                aria-label="Create new note"
              >
                <Plus className="h-6 w-6" />
              </motion.button>
            }
          />
        </div>
      )}
    </AnimatePresence>
  );
}
