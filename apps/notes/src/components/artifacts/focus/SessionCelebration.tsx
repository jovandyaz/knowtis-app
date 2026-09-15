import { motion } from 'motion/react';

import { useMotionPreset } from '@knowtis/design-system';

const PIECE_COUNT = 24;
const SPREAD_PX = 320;
const FALL_PX = 260;
const ROTATION_DEG = 540;
const DELAY_GROUPS = 4;
const PIECE_TONES = [
  'bg-(--primary)',
  'bg-learn-correct',
  'bg-(--accent-foreground)',
] as const;

function spread(index: number): number {
  const fraction = index / (PIECE_COUNT - 1);
  return (fraction - 0.5) * 2 * SPREAD_PX;
}

/** One-shot confetti burst for a finished session; renders nothing under reduced motion. */
export function SessionCelebration() {
  const preset = useMotionPreset();
  if (preset.reduced) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 h-screen overflow-hidden"
    >
      {Array.from({ length: PIECE_COUNT }, (_, index) => (
        <motion.span
          key={index}
          className={`absolute left-1/2 top-1/4 h-3 w-2 rounded-sm ${PIECE_TONES[index % PIECE_TONES.length]}`}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
          animate={{
            opacity: [1, 1, 0],
            x: spread(index),
            y: FALL_PX,
            rotate: index % 2 === 0 ? ROTATION_DEG : -ROTATION_DEG,
          }}
          transition={{
            ...preset.grow,
            delay: (index % DELAY_GROUPS) * preset.stagger,
          }}
        />
      ))}
    </div>
  );
}
