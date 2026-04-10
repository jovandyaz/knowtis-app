import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { FileText } from 'lucide-react';

import { cn } from '../utils';
import { Button } from './Button';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  fullHeight?: boolean;
  children?: ReactNode;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      icon,
      title = 'No items found',
      description = 'Get started by creating your first item.',
      action,
      fullHeight = true,
      children,
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-center',
        fullHeight && 'min-h-[50vh]',
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
        <div className="rounded-full bg-(--muted) p-4">
          {icon ?? <FileText className="h-8 w-8 text-(--muted-foreground)" />}
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-(--foreground)">{title}</h3>
          <p className="text-sm text-(--muted-foreground)">{description}</p>
        </div>
        {action && (
          <Button onClick={action.onClick} size="sm">
            {action.label}
          </Button>
        )}
        {children}
      </div>
    </div>
  )
);
EmptyState.displayName = 'EmptyState';
