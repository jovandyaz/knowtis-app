import { forwardRef } from 'react';

import { motion } from 'motion/react';

import { useMotionPreset } from '../motion/useMotionPreset';
import { cn } from '../utils';

const DONUT_TONES = ['correct', 'incorrect', 'muted'] as const;
export type DonutTone = (typeof DONUT_TONES)[number];
export const DONUT_SIZE_DEFAULT = 140;
const DONUT_STROKE = 12;
const DONUT_STAGGER_S = 0.15;
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

export interface DonutChartProps {
  segments: DonutSegment[];
  centerLabel: string;
  centerSublabel?: string;
  /** Pixel diameter of the ring; the centre text is sized for `DONUT_SIZE_DEFAULT` and above. */
  size?: number;
  className?: string;
}

const DonutChart = forwardRef<HTMLDivElement, DonutChartProps>(
  (
    {
      segments,
      centerLabel,
      centerSublabel,
      size = DONUT_SIZE_DEFAULT,
      className,
    },
    ref
  ) => {
    const preset = useMotionPreset();
    const radius = (size - DONUT_STROKE) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
    const centre = size / 2;
    const summary = segments.map((s) => `${s.label} ${s.value}`).join(', ');
    const description = centerSublabel
      ? `${centerLabel} (${centerSublabel}): ${summary}`
      : `${centerLabel}: ${summary}`;

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
        className={cn(
          'relative inline-flex items-center justify-center',
          className
        )}
        style={{ width: size, height: size }}
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
              key={`${segment.tone}-${index}`}
              data-segment
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              strokeWidth={DONUT_STROKE}
              strokeDasharray={`${length} ${circumference}`}
              style={{ transformOrigin: 'center', rotate: `${rotation}deg` }}
              initial={
                preset.reduced
                  ? false
                  : { strokeDashoffset: length, opacity: 0 }
              }
              animate={{ strokeDashoffset: 0, opacity: 1 }}
              transition={{
                ...preset.grow,
                delay: preset.reduced ? 0 : index * DONUT_STAGGER_S,
              }}
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
        </div>
      </div>
    );
  }
);
DonutChart.displayName = 'DonutChart';

// eslint-disable-next-line react-refresh/only-export-components
export { DonutChart, DONUT_TONES, DONUT_STROKE };
