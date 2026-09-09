import { createElement, forwardRef, type HTMLAttributes } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-(--foreground) text-(--background)',
        secondary:
          'border-transparent bg-(--secondary) text-(--secondary-foreground)',
        destructive:
          'border-transparent bg-(--destructive) text-(--destructive-foreground)',
        outline: 'text-(--foreground)',
        success: 'border-transparent bg-(--success)/15 text-(--success)',
        warning: 'border-transparent bg-(--warning)/15 text-(--warning)',
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
  extends HTMLAttributes<HTMLElement>, VariantProps<typeof badgeVariants> {
  /** A badge is phrasing content; reach for `div` only where flow content is expected. */
  as?: 'span' | 'div';
}

const Badge = forwardRef<HTMLElement, BadgeProps>(
  ({ as = 'span', className, variant, ...props }, ref) =>
    createElement(as, {
      ...props,
      ref,
      className: cn(badgeVariants({ variant }), className),
    })
);
Badge.displayName = 'Badge';

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants };
