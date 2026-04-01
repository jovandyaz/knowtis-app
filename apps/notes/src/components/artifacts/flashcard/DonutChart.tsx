import { motion } from 'motion/react';

interface DonutSegment {
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  centerLabel: string;
  centerSublabel?: string;
  centerDetail?: string;
  size?: number;
}

const STROKE_WIDTH = 8;
const GAP_DEGREES = 3;

interface SegmentLayoutItem {
  index: number;
  color: string;
  segmentLength: number;
  gapLength: number;
  startOffset: number;
}

function buildSegmentLayout(
  segments: DonutSegment[],
  totalValue: number,
  circumference: number
): SegmentLayoutItem[] {
  const nonZero = segments.filter((s) => s.value > 0);
  const totalGapDeg = nonZero.length > 1 ? GAP_DEGREES * nonZero.length : 0;
  const availableDeg = 360 - totalGapDeg;
  const items: SegmentLayoutItem[] = [];
  let offsetDeg = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.value <= 0) {
      continue;
    }

    const segDeg = totalValue > 0 ? (seg.value / totalValue) * availableDeg : 0;
    const segLen = (segDeg / 360) * circumference;

    items.push({
      index: i,
      color: seg.color,
      segmentLength: segLen,
      gapLength: circumference - segLen,
      startOffset: (offsetDeg / 360) * circumference,
    });

    offsetDeg += segDeg + GAP_DEGREES;
  }

  return items;
}

export function DonutChart({
  segments,
  centerLabel,
  centerSublabel,
  centerDetail,
  size = 140,
}: DonutChartProps) {
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const totalValue = segments.reduce((sum, s) => sum + s.value, 0);
  const layout = buildSegmentLayout(segments, totalValue, circumference);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          className="text-muted/30"
          stroke="currentColor"
        />

        {/* Animated segments */}
        {layout.map((seg) => (
          <motion.circle
            key={seg.index}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${seg.segmentLength} ${seg.gapLength}`}
            initial={{
              strokeDashoffset: -seg.startOffset + seg.segmentLength,
              opacity: 0,
            }}
            animate={{
              strokeDashoffset: -seg.startOffset,
              opacity: 1,
            }}
            transition={{
              strokeDashoffset: {
                duration: 0.8,
                delay: 0.3 + seg.index * 0.15,
                ease: 'easeOut',
              },
              opacity: {
                duration: 0.3,
                delay: 0.3 + seg.index * 0.15,
              },
            }}
          />
        ))}
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl font-bold text-foreground"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {centerLabel}
        </motion.span>

        {centerSublabel && (
          <motion.span
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            {centerSublabel}
          </motion.span>
        )}

        {centerDetail && (
          <motion.span
            className="text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            {centerDetail}
          </motion.span>
        )}
      </div>
    </div>
  );
}
