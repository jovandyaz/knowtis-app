import type { ReactNode } from 'react';

import { ChevronDown, KeyRound, Loader2 } from 'lucide-react';

import { cn } from '../utils';
import { Button } from './Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  disabled?: boolean;
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
const OPTION_ROW_CLASSES = 'flex-col items-start gap-0.5';
const FLAT_GROUP_KEY = 'models';

function costGlyphs(level: number): string {
  const clamped = Math.min(
    MAX_COST_LEVEL,
    Math.max(MIN_COST_LEVEL, Math.trunc(level))
  );
  return COST_GLYPH.repeat(clamped);
}

function costLevel(m: ModelSelectOption): number {
  const level = m.costClass;
  return level === undefined || !Number.isFinite(level)
    ? NO_COST_LEVEL
    : Math.max(NO_COST_LEVEL, Math.trunc(level));
}

function tierCostLevel(items: readonly ModelSelectOption[]): number {
  return items.reduce((max, m) => Math.max(max, costLevel(m)), NO_COST_LEVEL);
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
  /**
   * Renders the rows as one-shot actions instead of a selection set: plain menu
   * items, no checked state. Pass `value` as null — an action list selects nothing.
   */
  rowsAreActions?: boolean;
  /**
   * Lists every model under this single heading instead of one heading per tier,
   * keeping `tierOrder` as the sort. The cost glyph moves onto each row, since one
   * heading cannot speak for tiers that differ in cost.
   */
  modelsLabel?: string;
  triggerLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
  emptyLabel?: string;
  retryLabel?: string;
  billedBadgeLabel?: string;
  triggerClassName?: string;
  triggerVariant?: 'ghost' | 'outline';
  disabled?: boolean;
  'aria-label'?: string;
}

function OptionRow({
  label,
  description,
  badge,
  cost,
}: {
  label: string;
  description?: string | undefined;
  badge?: ReactNode | undefined;
  cost?: string | undefined;
}) {
  return (
    <>
      <div className="flex w-full items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="truncate">{label}</span>
          {badge}
        </span>
        {cost ? (
          <span className="shrink-0 font-normal text-(--muted-foreground)">
            {cost}
          </span>
        ) : null}
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

function OptionGroup({
  asActions,
  value,
  onSelect,
  children,
}: {
  asActions: boolean;
  value: string | null;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  if (asActions) {
    return <div>{children}</div>;
  }
  return (
    <DropdownMenuRadioGroup
      {...(value !== null && { value })}
      onValueChange={onSelect}
    >
      {children}
    </DropdownMenuRadioGroup>
  );
}

function OptionItem({
  id,
  asAction,
  disabled = false,
  onSelect,
  children,
}: {
  id: string;
  asAction: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  if (asAction) {
    return (
      <DropdownMenuItem
        onSelect={() => onSelect(id)}
        disabled={disabled}
        className={OPTION_ROW_CLASSES}
      >
        {children}
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuRadioItem
      value={id}
      disabled={disabled}
      className={OPTION_ROW_CLASSES}
    >
      {children}
    </DropdownMenuRadioItem>
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
  rowsAreActions = false,
  modelsLabel,
  triggerLabel,
  loadingLabel,
  errorLabel,
  emptyLabel,
  retryLabel,
  billedBadgeLabel,
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
  const tierGroups = [...ordered, ...extraTiers]
    .map((tier) => ({
      key: tier,
      label: tier,
      items: models.filter((m) => m.tier === tier),
    }))
    .filter((g) => g.items.length > 0);
  const flatGroup =
    modelsLabel && tierGroups.length > 0
      ? {
          key: FLAT_GROUP_KEY,
          label: modelsLabel,
          items: tierGroups.flatMap((g) => g.items),
        }
      : undefined;
  const groups = flatGroup ? [flatGroup] : tierGroups;

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
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        className="w-72 max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto"
      >
        {visibleLeadingSection && (
          <OptionGroup
            asActions={rowsAreActions}
            value={value}
            onSelect={onSelect}
          >
            <DropdownMenuLabel className="text-xs uppercase tracking-wide">
              {visibleLeadingSection.label}
            </DropdownMenuLabel>
            {visibleLeadingSection.options.map((option) => (
              <OptionItem
                key={option.id}
                id={option.id}
                asAction={rowsAreActions}
                onSelect={onSelect}
              >
                <OptionRow
                  label={option.label}
                  description={option.description}
                />
              </OptionItem>
            ))}
          </OptionGroup>
        )}
        {groups.map((g, i) => {
          const level = tierCostLevel(g.items);
          return (
            <OptionGroup
              key={g.key}
              asActions={rowsAreActions}
              value={value}
              onSelect={onSelect}
            >
              {(i > 0 || hasLeadingSection) && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center justify-between text-xs uppercase tracking-wide">
                <span>{g.label}</span>
                {!flatGroup && level > NO_COST_LEVEL && (
                  <span className="font-normal normal-case tracking-normal text-(--muted-foreground)">
                    {costGlyphs(level)}
                  </span>
                )}
              </DropdownMenuLabel>
              {g.items.map((m) => {
                const description = renderDescription?.(m);
                const rowLevel = costLevel(m);
                return (
                  <OptionItem
                    key={m.id}
                    id={m.id}
                    asAction={rowsAreActions}
                    disabled={m.disabled ?? false}
                    onSelect={onSelect}
                  >
                    <OptionRow
                      label={m.label}
                      description={description}
                      cost={
                        flatGroup && rowLevel > NO_COST_LEVEL
                          ? costGlyphs(rowLevel)
                          : undefined
                      }
                      badge={
                        m.billedToUser && billedBadgeLabel ? (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-(--muted) px-1.5 py-0.5 text-[10px] font-normal text-(--muted-foreground)">
                            <KeyRound className="h-2.5 w-2.5" />
                            {billedBadgeLabel}
                          </span>
                        ) : undefined
                      }
                    />
                  </OptionItem>
                );
              })}
            </OptionGroup>
          );
        })}
        {isError && (
          <>
            {(hasLeadingSection || groups.length > 0) && (
              <DropdownMenuSeparator />
            )}
            <div className="px-2 py-1.5 text-xs text-(--muted-foreground)">
              {errorLabel ?? FALLBACK_LABEL}
            </div>
            {onRetry && retryLabel && (
              <DropdownMenuItem onSelect={onRetry}>
                {retryLabel}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
