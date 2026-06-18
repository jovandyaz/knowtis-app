import type { ReactNode } from 'react';

import { Check, ChevronDown } from 'lucide-react';

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

const COST_GLYPH = '$';
const MIN_COST_LEVEL = 1;
const MAX_COST_LEVEL = 3;
const NO_COST_LEVEL = 0;

function costGlyphs(level: number): string {
  const clamped = Math.min(
    MAX_COST_LEVEL,
    Math.max(MIN_COST_LEVEL, Math.trunc(level))
  );
  return COST_GLYPH.repeat(clamped);
}

function tierCostLevel(items: readonly ModelSelectOption[]): number {
  return items.reduce((max, m) => {
    const level = m.costClass;
    if (level === undefined || !Number.isFinite(level)) {
      return max;
    }
    return Math.max(max, Math.trunc(level));
  }, NO_COST_LEVEL);
}

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
  const known = new Set<string>(TIER_ORDER);
  const extraTiers = [...new Set(models.map((m) => m.tier))].filter(
    (tier) => !known.has(tier)
  );
  const groups = [...TIER_ORDER, ...extraTiers]
    .map((tier) => ({
      tier,
      items: models.filter((m) => m.tier === tier),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={models.length === 0}
        >
          <span className="truncate">
            {active?.label ?? triggerLabel ?? '—'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {groups.map((g, i) => {
          const level = tierCostLevel(g.items);
          return (
            <div key={g.tier}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center justify-between text-xs uppercase tracking-wide">
                <span>{tierLabel ? tierLabel(g.tier) : g.tier}</span>
                {level > NO_COST_LEVEL && (
                  <span className="font-normal normal-case tracking-normal text-(--muted-foreground)">
                    {costGlyphs(level)}
                  </span>
                )}
              </DropdownMenuLabel>
              {g.items.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => onSelect(m.id)}
                  className="flex-col items-start gap-0.5"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-medium">{m.label}</span>
                    {m.id === value && <Check className="h-3.5 w-3.5" />}
                  </div>
                  {renderDescription && (
                    <span className="text-xs text-(--muted-foreground)">
                      {renderDescription(m)}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          );
        })}
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
