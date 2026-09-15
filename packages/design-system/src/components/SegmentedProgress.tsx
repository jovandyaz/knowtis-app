import { forwardRef, useState, type HTMLAttributes } from 'react';

import { cva } from 'class-variance-authority';
import { motion } from 'motion/react';

import { useMotionPreset, type MotionPreset } from '../motion/useMotionPreset';
import { cn } from '../utils/cn';

export const SEGMENT_STATES = [
  'pending',
  'current',
  'correct',
  'wrong',
  'skipped',
] as const;

export type SegmentState = (typeof SEGMENT_STATES)[number];

export interface SegmentedProgressProps extends HTMLAttributes<HTMLDivElement> {
  segments: readonly SegmentState[];
  label: string;
  size?: 'track' | 'hero';
}

const progressVariants = cva('flex w-full', {
  variants: {
    size: { track: 'h-0.75', hero: 'h-3' },
  },
  defaultVariants: { size: 'track' },
});

const FILL_CLASS: Record<SegmentState, string> = {
  pending: 'bg-(--muted)',
  current: 'bg-(--primary)',
  correct: 'bg-learn-correct',
  wrong: 'bg-learn-incorrect',
  skipped: 'bg-learn-skipped',
};

const GLOW_TOKEN = {
  correct: '--learn-correct',
  wrong: '--learn-incorrect',
  skipped: '--learn-skipped',
} as const;

function isSettled(state: SegmentState): state is keyof typeof GLOW_TOKEN {
  return state !== 'pending' && state !== 'current';
}

interface SegmentProps {
  state: SegmentState;
  hero: boolean;
  delay: number;
  preset: MotionPreset;
}

const Segment = forwardRef<HTMLSpanElement, SegmentProps>(
  ({ state, hero, delay, preset }, ref) => {
    const [outcome, setOutcome] = useState<{
      state: SegmentState;
      reduced: boolean;
      boxShadow: string | string[];
    }>({ state, reduced: preset.reduced, boxShadow: 'none' });

    if (outcome.state !== state || outcome.reduced !== preset.reduced) {
      const shouldGlow =
        !preset.reduced && !isSettled(outcome.state) && isSettled(state);
      setOutcome({
        state,
        reduced: preset.reduced,
        boxShadow: shouldGlow
          ? [
              `0 0 8px 2px var(${GLOW_TOKEN[state]})`,
              `0 0 0px 0px var(${GLOW_TOKEN[state]})`,
            ]
          : 'none',
      });
    }

    const pulse = !preset.reduced && state === 'current';

    return (
      <motion.span
        ref={ref}
        data-state={state}
        aria-hidden="true"
        className={cn('min-w-0 flex-1 rounded-full', FILL_CLASS[state])}
        initial={
          preset.reduced
            ? false
            : hero
              ? { opacity: 0 }
              : state === 'current'
                ? { opacity: 1 }
                : false
        }
        animate={{
          opacity: pulse ? [1, 0.55, 1] : 1,
          boxShadow: preset.reduced ? 'none' : outcome.boxShadow,
        }}
        transition={
          preset.reduced
            ? preset.fade
            : {
                opacity: pulse
                  ? preset.currentPulse
                  : { ...preset.fade, delay: hero ? delay : 0 },
                boxShadow: preset.grow,
              }
        }
      />
    );
  }
);
Segment.displayName = 'Segment';

const SegmentedProgress = forwardRef<HTMLDivElement, SegmentedProgressProps>(
  ({ segments, label, size = 'track', className, style, ...rest }, ref) => {
    const preset = useMotionPreset();
    const settled = segments.filter(isSettled).length;
    const entranceDelay = Math.min(
      preset.stagger,
      (preset.fade.duration ?? 0) / Math.max(1, segments.length - 1)
    );

    return (
      <div
        ref={ref}
        {...rest}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={segments.length}
        aria-valuenow={settled}
        className={cn(progressVariants({ size }), className)}
        style={{
          gap: `min(2px, ${20 / Math.max(1, segments.length)}%)`,
          ...style,
        }}
      >
        {segments.map((state, index) => (
          <Segment
            key={index}
            state={state}
            hero={size === 'hero'}
            delay={entranceDelay * index}
            preset={preset}
          />
        ))}
      </div>
    );
  }
);
SegmentedProgress.displayName = 'SegmentedProgress';

export { SegmentedProgress };
