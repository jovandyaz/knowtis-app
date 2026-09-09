import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

import { motion } from 'motion/react';

import { useMotionPreset } from '../motion/useMotionPreset';
import { cn } from '../utils/cn';
import { CARD_SURFACE } from './Card';

export interface FlipCardProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'type' | 'aria-pressed' | 'aria-describedby' | 'children'
> {
  front: ReactNode;
  back: ReactNode;
  flipped: boolean;
  onFlip: () => void;
  /** Hint announced while the front face is showing; phrase it as the action. */
  frontHint: string;
  /** Hint announced while the back face is showing; phrase it as the action. */
  backHint: string;
}

const FACE_BASE = cn(
  CARD_SURFACE,
  'col-start-1 row-start-1 flex items-center justify-center p-6 transition-colors duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none hover:border-(--ring)'
);
const FLIP_DEGREES = 180;

/**
 * Two faces of a flashcard behind one toggle. Both faces render inside a
 * `<button>`, so neither may contain interactive content; a hint drawn inside a
 * face duplicates `frontHint`/`backHint` and belongs behind `aria-hidden`.
 * `className` styles the wrapper, so a `min-h-*` there stretches the button;
 * every other prop lands on the button itself.
 */
const FlipCard = forwardRef<HTMLButtonElement, FlipCardProps>(
  (
    { front, back, flipped, onFlip, frontHint, backHint, className, ...rest },
    ref
  ) => {
    const preset = useMotionPreset();
    const hintId = useId();
    return (
      <div className={cn('relative grid', className)}>
        <button
          ref={ref}
          {...rest}
          type="button"
          aria-pressed={flipped}
          aria-describedby={hintId}
          onClick={onFlip}
          className="grid min-h-56 w-full cursor-pointer rounded-lg text-left perspective-distant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2"
        >
          {preset.reduced ? (
            <>
              <motion.div
                data-face="stack"
                data-face-side="front"
                className={FACE_BASE}
                animate={{ opacity: flipped ? 0 : 1 }}
                transition={preset.fade}
                aria-hidden={flipped || undefined}
              >
                {front}
              </motion.div>
              <motion.div
                data-face="stack"
                data-face-side="back"
                className={FACE_BASE}
                animate={{ opacity: flipped ? 1 : 0 }}
                transition={preset.fade}
                aria-hidden={!flipped || undefined}
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
                aria-hidden={flipped || undefined}
              >
                {front}
              </div>
              <div
                data-face-side="back"
                className={cn(FACE_BASE, 'backface-hidden')}
                style={{ transform: `rotateY(${FLIP_DEGREES}deg)` }}
                aria-hidden={!flipped || undefined}
              >
                {back}
              </div>
            </motion.div>
          )}
        </button>
        <span id={hintId} aria-live="polite" className="sr-only">
          {flipped ? backHint : frontHint}
        </span>
      </div>
    );
  }
);
FlipCard.displayName = 'FlipCard';

export { FlipCard };
