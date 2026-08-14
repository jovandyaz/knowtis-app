import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../utils';

export interface RadioCardOption<T extends string> {
  value: T;
  title: string;
  description: string;
  icon?: LucideIcon;
}

export interface RadioCardGroupProps<T extends string> {
  options: ReadonlyArray<RadioCardOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
}

export function RadioCardGroup<T extends string>({
  options,
  value,
  onValueChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: RadioCardGroupProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-label={ariaLabel}
      value={value}
      onValueChange={(next) => {
        // Radix emits '' when the active item is re-clicked; an exclusive choice never deselects.
        const match = options.find((option) => option.value === next);
        if (match) {
          onValueChange(match.value);
        }
      }}
      disabled={disabled ?? false}
      className={cn('flex w-full flex-col gap-2', className)}
    >
      {options.map(({ value: optionValue, title, description, icon: Icon }) => (
        <ToggleGroupPrimitive.Item
          key={optionValue}
          value={optionValue}
          className={cn(
            'flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'border-(--border) hover:border-(--muted-foreground)/30 hover:bg-(--accent)/50',
            'data-[state=on]:border-(--primary) data-[state=on]:bg-(--primary)/5'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
              optionValue === value
                ? 'border-(--primary) bg-(--primary)'
                : 'border-(--muted-foreground)/40'
            )}
          >
            {optionValue === value && (
              <span className="h-2 w-2 rounded-full bg-(--primary-foreground)" />
            )}
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2">
              {Icon && (
                <Icon className="h-3.5 w-3.5 text-(--muted-foreground)" />
              )}
              <span className="text-sm font-medium">{title}</span>
            </span>
            <span className="mt-1 block text-xs text-(--muted-foreground)">
              {description}
            </span>
          </span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
