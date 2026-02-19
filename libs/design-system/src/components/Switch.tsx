import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../utils';

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: 'default' | 'sm';
}

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked,
      onCheckedChange,
      disabled,
      size = 'default',
      ...props
    },
    ref
  ) => {
    const isSmall = size === 'sm';
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        ref={ref}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out',
          'focus:outline-none focus:ring-2 focus:ring-(--primary) focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isSmall ? 'h-4 w-7' : 'h-6 w-11',
          checked ? 'bg-(--primary)' : 'bg-(--muted)',
          className
        )}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none inline-block transform rounded-full bg-white shadow ring-0',
            'transition duration-200 ease-in-out',
            isSmall ? 'h-3 w-3' : 'h-5 w-5',
            checked
              ? isSmall
                ? 'translate-x-3'
                : 'translate-x-5'
              : 'translate-x-0'
          )}
        />
      </button>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };
