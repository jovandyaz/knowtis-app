import { createPortal } from 'react-dom';

import { MOBILE_FAB_SLOT_ID } from '@/components/layout/MobileFabRail';
import { VoiceNoteRecorder } from '@/components/voice-note/VoiceNoteRecorder';
import { usePortalTarget } from '@/hooks/usePortalTarget';
import { preloadEditorChunk } from '@/lib/preload-editor';
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
  const voiceNotesEnabled = useAIStore((s) => s.voiceNotesEnabled);
  const showVoiceNote = aiEnabled && voiceNotesEnabled;
  const portalTarget = usePortalTarget(MOBILE_FAB_SLOT_ID);

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="flex flex-col items-end gap-4"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          {showVoiceNote && <VoiceNoteRecorder size="md" emphasis="quiet" />}
          <button
            type="button"
            className={cn(
              'flex size-14 items-center justify-center rounded-full',
              'bg-primary text-primary-foreground',
              'shadow-lg shadow-primary/25',
              'active:scale-95 transition-transform'
            )}
            aria-label="Create new note"
            onClick={onCreateNote}
            onPointerDown={preloadEditorChunk}
          >
            <Plus className="size-6" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    portalTarget
  );
}
