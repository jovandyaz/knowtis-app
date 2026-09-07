import { forwardRef, type ReactNode } from 'react';

import { motion } from 'motion/react';

import { useMotionPreset } from '../motion/useMotionPreset';
import { cn } from '../utils';

export const RING_SIZE_DEFAULT = 40;
export const RING_STROKE_DEFAULT = 3;

const TONE_CLASS = {
  primary: 'text-(--primary)',
  correct: 'text-learn-correct',
} as const;

export interface ProgressRingProps {
  value: number;
  max: number;
  label: string;
  size?: number;
  strokeWidth?: number;
  tone?: keyof typeof TONE_CLASS;
  className?: string;
  children?: ReactNode;
}

const ProgressRing = forwardRef<HTMLDivElement, ProgressRingProps>(
  (
    {
      value,
      max,
      label,
      size = RING_SIZE_DEFAULT,
      strokeWidth = RING_STROKE_DEFAULT,
      tone = 'primary',
      className,
      children,
    },
    ref
  ) => {
    const preset = useMotionPreset();
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.min(Math.max(value, 0), max);
    const ratio = max > 0 ? clamped / max : 0;
    const offset = circumference * (1 - ratio);
    const centre = size / 2;

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center',
          className
        )}
        style={{ width: size, height: size }}
      >
        <svg
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={clamped}
          width={size}
          height={size}
          className="-rotate-90"
        >
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-(--muted)"
          />
          <motion.circle
            data-arc
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: offset }}
            transition={preset.grow}
            className={TONE_CLASS[tone]}
          />
        </svg>
        {children ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums">
            {children}
          </div>
        ) : null}
      </div>
    );
  }
);
ProgressRing.displayName = 'ProgressRing';

export { ProgressRing };
