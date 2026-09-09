import { forwardRef, type HTMLAttributes } from 'react';

import { motion } from 'motion/react';

import type { ProgressRingTone } from '../constants/learn-tone';
import { useMotionPreset } from '../motion/useMotionPreset';
import { cn } from '../utils/cn';
import { clampProgress } from '../utils/progress';

export const RING_SIZE_DEFAULT = 40;
export const RING_STROKE_DEFAULT = 3;

const TONE_CLASS: Record<ProgressRingTone, string> = {
  primary: 'stroke-(--primary)',
  correct: 'stroke-learn-correct',
};

export interface ProgressRingProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max: number;
  label: string;
  size?: number;
  strokeWidth?: number;
  tone?: ProgressRingTone;
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
      style,
      children,
      ...rest
    },
    ref
  ) => {
    const preset = useMotionPreset();
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const { safeMax, clamped, ratio } = clampProgress(value, max);
    const offset = circumference * (1 - ratio);
    const centre = size / 2;

    return (
      <div
        ref={ref}
        {...rest}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        className={cn(
          'relative inline-flex items-center justify-center',
          className
        )}
        style={{ ...style, width: size, height: size }}
      >
        <svg
          aria-hidden="true"
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
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: offset }}
            transition={preset.grow}
            className={TONE_CLASS[tone]}
          />
        </svg>
        {children != null ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums"
          >
            {children}
          </div>
        ) : null}
      </div>
    );
  }
);
ProgressRing.displayName = 'ProgressRing';

export { ProgressRing };
