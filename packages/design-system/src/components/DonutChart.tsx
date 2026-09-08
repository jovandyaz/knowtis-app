import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { motion } from 'motion/react';

import type { DonutTone } from '../constants/learn-tone';
import { useMotionPreset } from '../motion/useMotionPreset';
import { cn } from '../utils';

export const DONUT_SIZE_DEFAULT = 140;
export const DONUT_STROKE = 12;
const FULL_TURN_DEGREES = 360;
const START_ANGLE_DEGREES = -90;

const TONE_CLASS: Record<DonutTone, string> = {
  correct: 'stroke-learn-correct',
  incorrect: 'stroke-learn-incorrect',
  muted: 'stroke-(--muted-foreground)',
};

export interface DonutSegment {
  value: number;
  tone: DonutTone;
  label: string;
}

export interface DonutChartProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> {
  segments: DonutSegment[];
  /**
   * The whole chart in one finished sentence — centre reading plus every
   * segment and its value, punctuation included. It is the chart's only
   * accessible name, and the package writes no copy of its own.
   */
  description: string;
  centerLabel: string;
  centerSublabel?: string;
  /** Pixel diameter of the ring; the centre text is sized for `DONUT_SIZE_DEFAULT` and above. */
  size?: number;
  /** Third centre line, under the sublabel; decorative, like the rest of the overlay. */
  children?: ReactNode;
}

const DonutChart = forwardRef<HTMLDivElement, DonutChartProps>(
  (
    {
      segments,
      description,
      centerLabel,
      centerSublabel,
      size = DONUT_SIZE_DEFAULT,
      className,
      style,
      children,
      ...rest
    },
    ref
  ) => {
    const preset = useMotionPreset();
    const radius = (size - DONUT_STROKE) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
    const centre = size / 2;

    const drawn = segments.filter((s) => s.value > 0 && total > 0);
    const arcs = drawn.map((segment, index) => {
      const consumedBefore = drawn
        .slice(0, index)
        .reduce((sum, s) => sum + s.value, 0);
      const length = (segment.value / total) * circumference;
      const rotation =
        (consumedBefore / total) * FULL_TURN_DEGREES + START_ANGLE_DEGREES;
      return { segment, index, length, rotation };
    });

    return (
      <div
        ref={ref}
        {...rest}
        className={cn(
          'relative inline-flex items-center justify-center',
          className
        )}
        style={{ ...style, width: size, height: size }}
      >
        <svg role="img" aria-label={description} width={size} height={size}>
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={DONUT_STROKE}
            className="stroke-(--muted)"
          />
          {arcs.map(({ segment, index, length, rotation }) => (
            <motion.circle
              key={index}
              data-segment
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              strokeWidth={DONUT_STROKE}
              strokeDasharray={`${length} ${circumference}`}
              style={{ rotate: `${rotation}deg` }}
              initial={
                preset.reduced
                  ? false
                  : { strokeDashoffset: length, opacity: 0 }
              }
              animate={{ strokeDashoffset: 0, opacity: 1 }}
              transition={{ ...preset.grow, delay: index * preset.stagger }}
              className={TONE_CLASS[segment.tone]}
            />
          ))}
        </svg>
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-2xl font-semibold tabular-nums">
            {centerLabel}
          </span>
          {centerSublabel ? (
            <span className="text-xs text-(--muted-foreground)">
              {centerSublabel}
            </span>
          ) : null}
          {children ? (
            <span className="text-xs text-(--muted-foreground)">
              {children}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
);
DonutChart.displayName = 'DonutChart';

export { DonutChart };
