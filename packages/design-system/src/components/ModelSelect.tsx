import type { ReactNode } from 'react';

import { Check, ChevronDown } from 'lucide-react';

import { Badge } from './Badge';
import { Button } from './Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';

export interface ModelSelectOption {
  id: string;
  label: string;
  tier: string;
  descriptionKey?: string;
  contextWindow?: number;
  costClass?: number;
}

const TIER_ORDER = ['fast', 'balanced', 'powerful'] as const;

export interface ModelSelectProps {
  models: ModelSelectOption[];
  value: string | null;
  onSelect: (id: string) => void;
  renderDescription?: (m: ModelSelectOption) => string;
  tierLabel?: (tier: string) => string;
  triggerLabel?: string;
  footer?: ReactNode;
}

export function ModelSelect({
  models,
  value,
  onSelect,
  renderDescription,
  tierLabel,
  triggerLabel,
  footer,
}: ModelSelectProps) {
  const active = models.find((m) => m.id === value);
  const groups = TIER_ORDER.map((tier) => ({
    tier,
    items: models.filter((m) => m.tier === tier),
  })).filter((g) => g.items.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5">
          <span className="truncate">
            {active?.label ?? triggerLabel ?? '—'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {groups.map((g, i) => (
          <div key={g.tier}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs uppercase tracking-wide">
              {tierLabel ? tierLabel(g.tier) : g.tier}
            </DropdownMenuLabel>
            {g.items.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={() => onSelect(m.id)}
                className="flex-col items-start gap-0.5"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-medium">{m.label}</span>
                  <span className="flex items-center gap-1">
                    <Badge variant="secondary">
                      {'$'.repeat(m.costClass ?? 1)}
                    </Badge>
                    {m.id === value && <Check className="h-3.5 w-3.5" />}
                  </span>
                </div>
                {renderDescription && (
                  <span className="text-xs text-(--muted-foreground)">
                    {renderDescription(m)}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        {footer && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-(--muted-foreground)">
              {footer}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
