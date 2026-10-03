import { useRef, useState, type ReactNode } from 'react';

import { Check, ChevronDown, KeyRound, Loader2 } from 'lucide-react';

import { cn } from '../utils/cn';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

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
const COLLISION_PADDING_PX = 8;
const GROUP_HEADING_CLASSES =
  'flex items-center justify-between text-xs uppercase tracking-wide';
const SEARCH_ROW_CLASSES =
  'cursor-pointer data-[selected=true]:bg-(--muted) data-[selected=true]:text-(--foreground)';
const SEARCH_GROUP_DIVIDER_CLASSES =
  '-mx-1 mt-1 border-t border-(--border) px-1 pt-1';
const RETRY_OPTION_VALUE = 'model-select:retry';
const QUERY_TERM_SEPARATOR = /\s+/;

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

interface ModelGroup {
  key: string;
  label: string;
  items: ModelSelectOption[];
}

function groupModels(
  models: readonly ModelSelectOption[],
  tierOrder: readonly string[] | undefined,
  modelsLabel: string | undefined
): { groups: ModelGroup[]; isFlat: boolean } {
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
  if (modelsLabel && tierGroups.length > 0) {
    return {
      groups: [
        {
          key: FLAT_GROUP_KEY,
          label: modelsLabel,
          items: tierGroups.flatMap((g) => g.items),
        },
      ],
      isFlat: true,
    };
  }
  return { groups: tierGroups, isFlat: false };
}

function queryTerms(query: string): string[] {
  return query.toLowerCase().split(QUERY_TERM_SEPARATOR).filter(Boolean);
}

function matchesQuery(
  option: { id: string; label: string },
  terms: readonly string[]
): boolean {
  const fields = [option.label.toLowerCase(), option.id.toLowerCase()];
  return terms.every((term) => fields.some((field) => field.includes(term)));
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
  /**
   * Opts into a text filter for long lists: the rows open as a searchable listbox
   * under an input with this placeholder, matching every typed word against each
   * row's label and id. Unset, the rows open as a plain menu.
   */
  searchPlaceholder?: string;
  /** Shown when the filter matches no row; falls back to `emptyLabel`. */
  noMatchesLabel?: string;
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

function ModelOptionRow({
  model,
  isFlat,
  renderDescription,
  billedBadgeLabel,
}: {
  model: ModelSelectOption;
  isFlat: boolean;
  renderDescription: ((m: ModelSelectOption) => string) | undefined;
  billedBadgeLabel: string | undefined;
}) {
  const rowLevel = costLevel(model);
  return (
    <OptionRow
      label={model.label}
      description={renderDescription?.(model)}
      cost={
        isFlat && rowLevel > NO_COST_LEVEL ? costGlyphs(rowLevel) : undefined
      }
      badge={
        model.billedToUser && billedBadgeLabel ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-(--muted) px-1.5 py-0.5 text-[10px] font-normal text-(--muted-foreground)">
            <KeyRound className="size-2.5" />
            {billedBadgeLabel}
          </span>
        ) : undefined
      }
    />
  );
}

function GroupHeading({
  group,
  isFlat,
}: {
  group: ModelGroup;
  isFlat: boolean;
}) {
  const level = tierCostLevel(group.items);
  return (
    <>
      <span>{group.label}</span>
      {!isFlat && level > NO_COST_LEVEL && (
        <span className="font-normal normal-case tracking-normal text-(--muted-foreground)">
          {costGlyphs(level)}
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

function SearchGroup({
  heading,
  divided,
  children,
}: {
  heading: ReactNode;
  divided: boolean;
  children: ReactNode;
}) {
  return (
    <CommandGroup
      heading={
        <span className={cn(GROUP_HEADING_CLASSES, 'font-semibold')}>
          {heading}
        </span>
      }
      className={cn('p-0', divided && SEARCH_GROUP_DIVIDER_CLASSES)}
    >
      {children}
    </CommandGroup>
  );
}

function SearchOption({
  id,
  asAction,
  isCurrent,
  disabled = false,
  onPick,
  children,
}: {
  id: string;
  asAction: boolean;
  isCurrent: boolean;
  disabled?: boolean;
  onPick: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <CommandItem
      value={id}
      disabled={disabled}
      aria-checked={asAction ? undefined : isCurrent}
      onSelect={() => onPick(id)}
      className={cn(
        OPTION_ROW_CLASSES,
        SEARCH_ROW_CLASSES,
        !asAction && 'pr-8'
      )}
    >
      {children}
      {!asAction && isCurrent && (
        <Check className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-current" />
      )}
    </CommandItem>
  );
}

interface ModelSearchListProps {
  models: readonly ModelSelectOption[];
  leadingSection: ModelSelectSection | undefined;
  tierOrder: readonly string[] | undefined;
  modelsLabel: string | undefined;
  value: string | null;
  rowsAreActions: boolean;
  renderDescription: ((m: ModelSelectOption) => string) | undefined;
  billedBadgeLabel: string | undefined;
  placeholder: string;
  listLabel: string;
  noMatchesLabel: string;
  errorLabel: string | undefined;
  retryLabel: string | undefined;
  onPick: (id: string) => void;
  onRetry: (() => void) | undefined;
}

// The query lives only while the popover is open: closing unmounts the list,
// so every reopen starts from the full list.
function ModelSearchList({
  models,
  leadingSection,
  tierOrder,
  modelsLabel,
  value,
  rowsAreActions,
  renderDescription,
  billedBadgeLabel,
  placeholder,
  listLabel,
  noMatchesLabel,
  errorLabel,
  retryLabel,
  onPick,
  onRetry,
}: ModelSearchListProps) {
  const visibleFor = (q: string) => {
    const terms = queryTerms(q);
    const leadingOptions =
      leadingSection?.options.filter((option) => matchesQuery(option, terms)) ??
      [];
    const { groups, isFlat } = groupModels(
      models.filter((m) => matchesQuery(m, terms)),
      tierOrder,
      modelsLabel
    );
    const firstMatch =
      leadingOptions[0]?.id ??
      groups.flatMap((g) => g.items).find((m) => !m.disabled)?.id ??
      '';
    return { terms, leadingOptions, groups, isFlat, firstMatch };
  };
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(() => visibleFor('').firstMatch);
  const listRef = useRef<HTMLDivElement>(null);
  const { terms, leadingOptions, groups, isFlat } = visibleFor(query);
  const hasLeading = leadingOptions.length > 0;
  // cmdk re-scrolls the previously active row after a query change; owning the
  // active row stops that stale scroll from undoing the reset.
  const changeQuery = (next: string) => {
    setQuery(next);
    setActive(visibleFor(next).firstMatch);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  };

  return (
    <Command
      shouldFilter={false}
      label={placeholder}
      value={active}
      onValueChange={setActive}
    >
      <CommandInput
        value={query}
        onValueChange={changeQuery}
        placeholder={placeholder}
      />
      <CommandList ref={listRef} label={listLabel} className="p-1">
        {terms.length > 0 && <CommandEmpty>{noMatchesLabel}</CommandEmpty>}
        {hasLeading && leadingSection && (
          <SearchGroup heading={leadingSection.label} divided={false}>
            {leadingOptions.map((option) => (
              <SearchOption
                key={option.id}
                id={option.id}
                asAction={rowsAreActions}
                isCurrent={option.id === value}
                onPick={onPick}
              >
                <OptionRow
                  label={option.label}
                  description={option.description}
                />
              </SearchOption>
            ))}
          </SearchGroup>
        )}
        {groups.map((g, i) => (
          <SearchGroup
            key={g.key}
            heading={<GroupHeading group={g} isFlat={isFlat} />}
            divided={i > 0 || hasLeading}
          >
            {g.items.map((m) => (
              <SearchOption
                key={m.id}
                id={m.id}
                asAction={rowsAreActions}
                isCurrent={m.id === value}
                disabled={m.disabled ?? false}
                onPick={onPick}
              >
                <ModelOptionRow
                  model={m}
                  isFlat={isFlat}
                  renderDescription={renderDescription}
                  billedBadgeLabel={billedBadgeLabel}
                />
              </SearchOption>
            ))}
          </SearchGroup>
        ))}
        {errorLabel !== undefined && (
          <CommandGroup
            heading={errorLabel}
            className={cn(
              'p-0',
              (hasLeading || groups.length > 0) && SEARCH_GROUP_DIVIDER_CLASSES
            )}
          >
            {onRetry && retryLabel && (
              <CommandItem
                value={RETRY_OPTION_VALUE}
                onSelect={onRetry}
                className={SEARCH_ROW_CLASSES}
              >
                {retryLabel}
              </CommandItem>
            )}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
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
  searchPlaceholder,
  noMatchesLabel,
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
  const [searchOpen, setSearchOpen] = useState(false);
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

  const trigger = (
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
  );

  if (searchPlaceholder !== undefined) {
    const closeAfter = (action: () => void) => {
      action();
      setSearchOpen(false);
    };
    return (
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={COLLISION_PADDING_PX}
          aria-label={ariaLabel ?? searchPlaceholder}
          className="flex max-h-(--radix-popover-content-available-height) flex-col p-0"
        >
          <ModelSearchList
            models={models}
            leadingSection={visibleLeadingSection}
            tierOrder={tierOrder}
            modelsLabel={modelsLabel}
            value={value}
            rowsAreActions={rowsAreActions}
            renderDescription={renderDescription}
            billedBadgeLabel={billedBadgeLabel}
            placeholder={searchPlaceholder}
            listLabel={ariaLabel ?? searchPlaceholder}
            noMatchesLabel={noMatchesLabel ?? emptyLabel ?? FALLBACK_LABEL}
            errorLabel={isError ? (errorLabel ?? FALLBACK_LABEL) : undefined}
            retryLabel={retryLabel}
            onPick={(id) => closeAfter(() => onSelect(id))}
            onRetry={onRetry && (() => closeAfter(onRetry))}
          />
        </PopoverContent>
      </Popover>
    );
  }

  const { groups, isFlat } = groupModels(models, tierOrder, modelsLabel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={COLLISION_PADDING_PX}
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
        {groups.map((g, i) => (
          <OptionGroup
            key={g.key}
            asActions={rowsAreActions}
            value={value}
            onSelect={onSelect}
          >
            {(i > 0 || hasLeadingSection) && <DropdownMenuSeparator />}
            <DropdownMenuLabel className={GROUP_HEADING_CLASSES}>
              <GroupHeading group={g} isFlat={isFlat} />
            </DropdownMenuLabel>
            {g.items.map((m) => (
              <OptionItem
                key={m.id}
                id={m.id}
                asAction={rowsAreActions}
                disabled={m.disabled ?? false}
                onSelect={onSelect}
              >
                <ModelOptionRow
                  model={m}
                  isFlat={isFlat}
                  renderDescription={renderDescription}
                  billedBadgeLabel={billedBadgeLabel}
                />
              </OptionItem>
            ))}
          </OptionGroup>
        ))}
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
