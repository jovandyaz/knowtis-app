import { forwardRef, useId, type ReactNode } from 'react';

import { motion } from 'motion/react';

import { useMotionPreset } from '../motion/useMotionPreset';
import { cn } from '../utils';

export interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  flipped: boolean;
  onFlip: () => void;
  frontLabel: string;
  backLabel: string;
  className?: string;
}

const FACE_BASE =
  'col-start-1 row-start-1 flex items-center justify-center rounded-xl border border-(--border) bg-(--card) p-6 text-(--card-foreground) transition-colors hover:border-(--ring)';
const FLIP_DEGREES = 180;

const FlipCard = forwardRef<HTMLButtonElement, FlipCardProps>(
  ({ front, back, flipped, onFlip, frontLabel, backLabel, className }, ref) => {
    const preset = useMotionPreset();
    const hintId = useId();
    return (
      <div className={cn('relative', className)}>
        <button
          ref={ref}
          type="button"
          aria-pressed={flipped}
          aria-describedby={hintId}
          onClick={onFlip}
          className="grid min-h-56 w-full text-left perspective-distant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2"
        >
          {preset.reduced ? (
            <>
              <motion.div
                data-face="stack"
                data-face-side="front"
                className={FACE_BASE}
                animate={{ opacity: flipped ? 0 : 1 }}
                transition={preset.fade}
                aria-hidden={flipped}
              >
                {front}
              </motion.div>
              <motion.div
                data-face="stack"
                data-face-side="back"
                className={FACE_BASE}
                animate={{ opacity: flipped ? 1 : 0 }}
                transition={preset.fade}
                aria-hidden={!flipped}
              >
                {back}
              </motion.div>
            </>
          ) : (
            <motion.div
              data-face="flip"
              className="col-start-1 row-start-1 grid transform-3d"
              animate={{ rotateY: flipped ? FLIP_DEGREES : 0 }}
              transition={preset.flip}
            >
              <div
                data-face-side="front"
                className={cn(FACE_BASE, 'backface-hidden')}
                aria-hidden={flipped}
              >
                {front}
              </div>
              <div
                data-face-side="back"
                className={cn(FACE_BASE, 'backface-hidden')}
                style={{ transform: `rotateY(${FLIP_DEGREES}deg)` }}
                aria-hidden={!flipped}
              >
                {back}
              </div>
            </motion.div>
          )}
        </button>
        <span id={hintId} className="sr-only">
          {flipped ? backLabel : frontLabel}
        </span>
      </div>
    );
  }
);
FlipCard.displayName = 'FlipCard';

export { FlipCard };
