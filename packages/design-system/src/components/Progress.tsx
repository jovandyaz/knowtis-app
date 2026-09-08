import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../utils';

const PERCENT = 100;
const MAX_FLOOR = 1;

const indicatorVariants = cva(
  'h-full w-full rounded-full transition-transform duration-(--motion-duration-base) ease-enter motion-reduce:transition-none',
  {
    variants: {
      tone: {
        primary: 'bg-(--primary)',
        correct: 'bg-learn-correct',
        incorrect: 'bg-learn-incorrect',
        danger: 'bg-(--destructive)',
      },
    },
    defaultVariants: { tone: 'primary' },
  }
);

export interface ProgressProps
  extends
    Omit<
      ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
      'value' | 'max' | 'aria-label'
    >,
    VariantProps<typeof indicatorVariants> {
  value: number;
  max: number;
  label: string;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max, label, tone, ...props }, ref) => {
    const safeMax = Math.max(max, MAX_FLOOR);
    const clamped = Math.min(Math.max(value, 0), safeMax);
    const percent = (clamped / safeMax) * PERCENT;
    return (
      <ProgressPrimitive.Root
        ref={ref}
        value={clamped}
        max={safeMax}
        aria-label={label}
        className={cn(
          'relative h-1.5 w-full overflow-hidden rounded-full bg-(--muted)',
          className
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={indicatorVariants({ tone })}
          style={{ transform: `translateX(-${PERCENT - percent}%)` }}
        />
      </ProgressPrimitive.Root>
    );
  }
);
Progress.displayName = 'Progress';

export { Progress };
