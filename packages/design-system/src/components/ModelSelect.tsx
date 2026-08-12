import type { ReactNode } from 'react';

import { Check, ChevronDown, KeyRound, Loader2 } from 'lucide-react';

import { cn } from '../utils';
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
  description?: string;
  contextWindow?: number;
  costClass?: number;
  billedToUser?: boolean;
}

export interface ModelSelectSectionOption {
  id: string;
  label: string;
  description?: string;
}

export interface ModelSelectSection {
  label: string;
  options: ReadonlyArray<ModelSelectSectionOption>;
}

export type ModelSelectStatus = 'loading' | 'error' | 'ready';

const COST_GLYPH = '$';
const MIN_COST_LEVEL = 1;
const MAX_COST_LEVEL = 3;
const NO_COST_LEVEL = 0;
const FALLBACK_LABEL = '—';

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
  /** Tier group ordering; unlisted tiers append in first-appearance order. Defaults to first-appearance order alone. */
  tierOrder?: readonly string[];
  status?: ModelSelectStatus;
  onRetry?: () => void;
  renderDescription?: (m: ModelSelectOption) => string;
  /**
   * Options listed above the tier groups. Rendered whatever `status` is — they are constants, not loaded data.
   * Option ids must be unique across the section and `models`; a collision renders two checked rows.
   */
  leadingSection?: ModelSelectSection;
  tierLabel?: (tier: string) => string;
  triggerLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
  emptyLabel?: string;
  retryLabel?: string;
  billedBadgeLabel?: string;
  footer?: ReactNode;
  triggerClassName?: string;
  triggerVariant?: 'ghost' | 'outline';
  disabled?: boolean;
  'aria-label'?: string;
}

function OptionRow({
  label,
  description,
  selected,
  badge,
}: {
  label: string;
  description?: string | undefined;
  selected: boolean;
  badge?: ReactNode | undefined;
}) {
  return (
    <>
      <div className="flex w-full items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="truncate">{label}</span>
          {badge}
        </span>
        {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
      </div>
      {description && (
        <span
          className="w-full min-w-0 line-clamp-1 text-xs text-(--muted-foreground)"
          title={description}
        >
          {description}
        </span>
      )}
    </>
  );
}

export function ModelSelect({
  models,
  value,
  onSelect,
  tierOrder,
  status = 'ready',
  onRetry,
  renderDescription,
  leadingSection,
  tierLabel,
  triggerLabel,
  loadingLabel,
  errorLabel,
  emptyLabel,
  retryLabel,
  billedBadgeLabel,
  footer,
  triggerClassName,
  triggerVariant = 'ghost',
  disabled = false,
  'aria-label': ariaLabel,
}: ModelSelectProps) {
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const visibleLeadingSection =
    leadingSection && leadingSection.options.length > 0
      ? leadingSection
      : undefined;
  const hasLeadingSection = !!visibleLeadingSection;
  const isEmpty =
    status === 'ready' && models.length === 0 && !hasLeadingSection;
  const triggerDisabled =
    disabled || isEmpty || (isLoading && !hasLeadingSection);

  const active =
    models.find((m) => m.id === value) ??
    visibleLeadingSection?.options.find((o) => o.id === value);
  const ordered = tierOrder ?? [];
  const known = new Set<string>(ordered);
  const extraTiers = [...new Set(models.map((m) => m.tier))].filter(
    (tier) => !known.has(tier)
  );
  const groups = [...ordered, ...extraTiers]
    .map((tier) => ({
      tier,
      items: models.filter((m) => m.tier === tier),
    }))
    .filter((g) => g.items.length > 0);

  const triggerText = ((): string => {
    if (active) {
      return active.label;
    }
    if (isLoading) {
      return loadingLabel ?? FALLBACK_LABEL;
    }
    if (isError) {
      return errorLabel ?? FALLBACK_LABEL;
    }
    if (isEmpty) {
      return emptyLabel ?? FALLBACK_LABEL;
    }
    return triggerLabel ?? FALLBACK_LABEL;
  })();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size="sm"
          className={cn('gap-1.5', triggerClassName)}
          disabled={triggerDisabled}
          aria-label={ariaLabel ? `${ariaLabel}: ${triggerText}` : undefined}
        >
          {isLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60 motion-reduce:animate-none" />
          )}
          <span className="truncate">{triggerText}</span>
          {!isLoading && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {visibleLeadingSection && (
          <>
            <DropdownMenuLabel className="text-xs uppercase tracking-wide">
              {visibleLeadingSection.label}
            </DropdownMenuLabel>
            {visibleLeadingSection.options.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onSelect={() => onSelect(option.id)}
                className="flex-col items-start gap-0.5"
              >
                <OptionRow
                  label={option.label}
                  description={option.description}
                  selected={option.id === value}
                />
              </DropdownMenuItem>
            ))}
          </>
        )}
        {isError ? (
          <>
            {hasLeadingSection && <DropdownMenuSeparator />}
            <div className="px-2 py-1.5 text-xs text-(--muted-foreground)">
              {errorLabel ?? FALLBACK_LABEL}
            </div>
            {onRetry && retryLabel && (
              <DropdownMenuItem onSelect={onRetry}>
                {retryLabel}
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            {groups.map((g, i) => {
              const level = tierCostLevel(g.items);
              return (
                <div key={g.tier}>
                  {(i > 0 || hasLeadingSection) && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="flex items-center justify-between text-xs uppercase tracking-wide">
                    <span>{tierLabel ? tierLabel(g.tier) : g.tier}</span>
                    {level > NO_COST_LEVEL && (
                      <span className="font-normal normal-case tracking-normal text-(--muted-foreground)">
                        {costGlyphs(level)}
                      </span>
                    )}
                  </DropdownMenuLabel>
                  {g.items.map((m) => {
                    const description = renderDescription?.(m);
                    return (
                      <DropdownMenuItem
                        key={m.id}
                        onSelect={() => onSelect(m.id)}
                        className="flex-col items-start gap-0.5"
                      >
                        <OptionRow
                          label={m.label}
                          description={description}
                          selected={m.id === value}
                          badge={
                            m.billedToUser && billedBadgeLabel ? (
                              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-(--muted) px-1.5 py-0.5 text-[10px] font-normal text-(--muted-foreground)">
                                <KeyRound className="h-2.5 w-2.5" />
                                {billedBadgeLabel}
                              </span>
                            ) : undefined
                          }
                        />
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
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
