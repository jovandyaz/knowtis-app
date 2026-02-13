import type { LucideIcon } from 'lucide-react';

import { cn } from '@knowtis/design-system';

interface AccessOptionCardProps {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: LucideIcon;
  title: string;
  description: string;
}

export function AccessOptionCard({
  selected,
  disabled,
  onClick,
  icon: Icon,
  title,
  description,
}: AccessOptionCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all disabled:opacity-50',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/30 hover:bg-accent/50',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center',
          selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
        )}
      >
        {selected && (
          <div className="w-2 h-2 rounded-full bg-primary-foreground" />
        )}
      </div>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </button>
  );
}
