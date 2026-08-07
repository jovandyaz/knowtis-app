import type { ReactNode } from 'react';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';

import { cn } from '../utils';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Native tooltip / accessible hint for the option. */
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedControlOption<T>>;
  /** null renders with no segment active (an external override is in effect). */
  value: T | null;
  onValueChange: (value: T) => void;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-label={ariaLabel}
      value={value ?? ''}
      onValueChange={(next) => {
        // Radix emits '' when the active item is re-clicked; a segmented control never deselects.
        const match = options.find((option) => option.value === next);
        if (match) {
          onValueChange(match.value);
        }
      }}
      disabled={disabled ?? false}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg bg-(--muted) p-0.5',
        className
      )}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          title={option.title}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium text-(--muted-foreground) transition-colors',
            'hover:text-(--foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
            'disabled:pointer-events-none disabled:opacity-50',
            'data-[state=on]:bg-(--background) data-[state=on]:text-(--foreground) data-[state=on]:shadow-sm'
          )}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
