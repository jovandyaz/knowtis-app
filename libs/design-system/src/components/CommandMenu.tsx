import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { ChevronRight } from 'lucide-react';

import { cn } from '../utils';

/* ─── Content (outer container) ─── */

interface CommandMenuContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Fixed width preset */
  width?: 'sm' | 'md' | 'lg';
}

const WIDTH_MAP = {
  sm: 'w-48',
  md: 'w-64',
  lg: 'w-72',
} as const;

const CommandMenuContent = forwardRef<HTMLDivElement, CommandMenuContentProps>(
  ({ className, width = 'md', children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'z-50 overflow-hidden rounded-xl border border-primary/20',
        'bg-popover/95 shadow-[0_0_30px_-8px] shadow-primary/20 backdrop-blur-xl',
        'animate-in fade-in zoom-in-95 duration-150',
        WIDTH_MAP[width],
        className
      )}
      {...props}
    >
      <div className="max-h-80 overflow-y-auto p-2">{children}</div>
    </div>
  )
);
CommandMenuContent.displayName = 'CommandMenuContent';

/* ─── Group ─── */

interface CommandMenuGroupProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  /** Show separator above this group */
  showSeparator?: boolean;
}

const CommandMenuGroup = forwardRef<HTMLDivElement, CommandMenuGroupProps>(
  ({ className, label, showSeparator, children, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {showSeparator && <div className="mx-2 my-2 border-t border-border/20" />}
      {label && (
        <div className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/70">
          {label}
        </div>
      )}
      {children}
    </div>
  )
);
CommandMenuGroup.displayName = 'CommandMenuGroup';

/* ─── Item ─── */

interface CommandMenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  label: string;
  description?: string;
  selected?: boolean;
  hasSubMenu?: boolean;
}

const CommandMenuItem = forwardRef<HTMLButtonElement, CommandMenuItemProps>(
  (
    { className, icon, label, description, selected, hasSubMenu, ...props },
    ref
  ) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs',
        'transition-all duration-150',
        selected
          ? 'bg-foreground/7 text-foreground'
          : 'text-foreground hover:bg-foreground/5',
        className
      )}
      {...props}
    >
      {icon && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        {description && (
          <span className="block truncate text-[11px] text-muted-foreground/70">
            {description}
          </span>
        )}
      </span>
      {hasSubMenu && (
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
    </button>
  )
);
CommandMenuItem.displayName = 'CommandMenuItem';

/* ─── Back button ─── */

interface CommandMenuBackProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

const CommandMenuBack = forwardRef<HTMLButtonElement, CommandMenuBackProps>(
  ({ className, label, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'mb-1 flex items-center gap-1 px-2 py-1 text-xs',
        'text-muted-foreground transition-colors hover:text-foreground',
        className
      )}
      {...props}
    >
      <ChevronRight className="h-3 w-3 rotate-180" />
      {label}
    </button>
  )
);
CommandMenuBack.displayName = 'CommandMenuBack';

export {
  CommandMenuContent,
  CommandMenuGroup,
  CommandMenuItem,
  CommandMenuBack,
  type CommandMenuContentProps,
  type CommandMenuGroupProps,
  type CommandMenuItemProps,
  type CommandMenuBackProps,
};
