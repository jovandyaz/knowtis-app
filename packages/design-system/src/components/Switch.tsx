import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '../utils/cn';

export interface SwitchProps extends Omit<
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  'checked' | 'onCheckedChange'
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: 'default' | 'sm';
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, size = 'default', ...props }, ref) => {
    const isSmall = size === 'sm';
    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={cn(
          'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none',
          'focus:outline-none focus:ring-2 focus:ring-(--primary) focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=checked]:bg-(--primary) data-[state=unchecked]:bg-(--muted)',
          isSmall ? 'h-4 w-7' : 'h-6 w-11',
          className
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none inline-block transform rounded-full bg-(--switch-thumb) shadow ring-0',
            'transition duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none',
            'data-[state=unchecked]:translate-x-0',
            isSmall
              ? 'h-3 w-3 data-[state=checked]:translate-x-3'
              : 'h-5 w-5 data-[state=checked]:translate-x-5'
          )}
        />
      </SwitchPrimitive.Root>
    );
  }
);

Switch.displayName = 'Switch';
