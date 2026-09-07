import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../utils';

export type KbdProps = HTMLAttributes<HTMLElement>;

/** Keyboard hint; hidden from assistive tech by default because the action it decorates already has a name. */
const Kbd = forwardRef<HTMLElement, KbdProps>(
  ({ className, 'aria-hidden': ariaHidden = true, ...props }, ref) => {
    return (
      <kbd
        aria-hidden={ariaHidden}
        className={cn(
          'inline-flex h-5 min-w-5 items-center justify-center rounded border border-(--border) bg-(--muted) px-1.5 font-mono text-2xs font-medium text-(--muted-foreground)',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Kbd.displayName = 'Kbd';

export { Kbd };
