import { VoiceNoteRecorder } from '@/components/voice-note/VoiceNoteRecorder';
import { useAIStore } from '@/stores/ai.store';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@knowtis/design-system';
import { useScrollDirection } from '@knowtis/shared-hooks';

interface FloatingCreateButtonProps {
  onCreateNote: () => void;
}

export function FloatingCreateButton({
  onCreateNote,
}: FloatingCreateButtonProps) {
  const scrollDirection = useScrollDirection();
  const isVisible = scrollDirection !== 'down';
  const aiEnabled = useAIStore((s) => s.aiEnabled);

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed bottom-20 right-5 z-50 flex flex-col items-center gap-3 md:hidden">
          {aiEnabled && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              <VoiceNoteRecorder />
            </motion.div>
          )}
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
            onClick={onCreateNote}
          >
            <Plus className="h-6 w-6" />
          </motion.button>
        </div>
      )}
    </AnimatePresence>
  );
}
