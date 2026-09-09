import { forwardRef, type HTMLAttributes } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-(--foreground) text-(--background)',
        secondary:
          'border-transparent bg-(--secondary) text-(--secondary-foreground)',
        destructive:
          'border-transparent bg-(--destructive) text-(--destructive-foreground)',
        outline: 'text-(--foreground)',
        success: 'border-transparent bg-emerald-500/15 text-emerald-600',
        warning: 'border-transparent bg-amber-500/15 text-amber-600',
        count:
          'h-5 min-w-5 justify-center border-transparent bg-(--primary) px-1.5 text-2xs tabular-nums text-(--primary-foreground)',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants };
