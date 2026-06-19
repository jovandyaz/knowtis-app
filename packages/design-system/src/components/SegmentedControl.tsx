import { forwardRef, useRef, type KeyboardEvent, type ReactNode } from 'react';

import type { LucideIcon } from 'lucide-react';

import { cn } from '../utils';

export interface SegmentedControlItem {
  value: string;
  label: ReactNode;
  icon?: LucideIcon;
}

export interface SegmentedControlProps {
  items: SegmentedControlItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Generates tab/panel ids: `${idBase}-tab-${value}` controls `${idBase}-panel-${value}`. */
  idBase: string;
  ariaLabel?: string;
  className?: string;
}

export const SegmentedControl = forwardRef<
  HTMLDivElement,
  SegmentedControlProps
>(({ items, value, onValueChange, idBase, ariaLabel, className }, ref) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusValue = (next: string) => {
    onValueChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = items.findIndex((i) => i.value === value);
    if (idx === -1) {
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusValue(items[(idx + 1) % items.length].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusValue(items[(idx - 1 + items.length) % items.length].value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusValue(items[0].value);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusValue(items[items.length - 1].value);
    }
  };

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-(--muted) p-1',
        className
      )}
    >
      {items.map(({ value: v, label, icon: Icon }) => {
        const selected = v === value;
        return (
          <button
            key={v}
            ref={(el) => {
              refs.current[v] = el;
            }}
            id={`${idBase}-tab-${v}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${v}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(v)}
            onKeyDown={onKeyDown}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-1',
              'active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
              selected
                ? 'bg-(--background) text-(--foreground) shadow-sm'
                : 'text-(--muted-foreground) hover:text-(--foreground)'
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        );
      })}
    </div>
  );
});

SegmentedControl.displayName = 'SegmentedControl';
