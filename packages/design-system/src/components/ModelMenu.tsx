import { Fragment, type ReactNode } from 'react';

import { ChevronDown, KeyRound, Loader2, Lock } from 'lucide-react';

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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu';

export interface ModelMenuPrimaryRow {
  /** Intent value ('fast' | 'balanced' | 'powerful') — opaque here. */
  id: string;
  /** Resolved model name, e.g. "Sonnet 5". */
  label: string;
  /** Job line, e.g. "Balance entre calidad y velocidad". */
  description: string;
  /** Anonymous: lock glyph instead of check slot, and the row acts as the upsell. */
  locked?: boolean;
}

export interface ModelMenuModelRow {
  id: string;
  label: string;
  description?: string;
  /** Pre-rendered glyphs "$".."$$$". */
  cost?: string;
  /** "Tu clave" — renders KeyRound pill when set. */
  billedBadge?: string;
}

export interface ModelMenuEffort {
  /** "Esfuerzo". */
  label: string;
  /** 'auto' | ReasoningEffort. */
  value: string;
  options: ReadonlyArray<{ id: string; label: string; description?: string }>;
  footnote?: string;
  /** Anonymous: inert locked row. */
  locked?: boolean;
  onChange: (id: string) => void;
}

export interface ModelMenuMoreModels {
  /** "Más modelos". */
  label: string;
  groups: ReadonlyArray<{ label: string; options: ModelMenuModelRow[] }>;
}

export interface ModelMenuProps {
  primary: ModelMenuPrimaryRow[];
  /** Selected primary id OR advanced model id. */
  value: string | null;
  onSelect: (id: string) => void;
  effort?: ModelMenuEffort;
  moreModels?: ModelMenuMoreModels;
  /** Anonymous upsell. */
  footerCta?: { label: string; onClick: () => void };
  /** Accessible suffix for a locked row, e.g. "requiere cuenta". */
  lockedHint?: string;
  /**
   * Renders the effort and more-models sections inline instead of as side
   * flyouts. Required below ~768px, where a flyout cannot fit beside the menu.
   */
  inlineSections?: boolean;
  /** Model name. */
  triggerLabel: string;
  /** Effort tail — renders "· {detail}" muted. */
  triggerDetail?: string;
  status?: 'loading' | 'error' | 'ready';
  onRetry?: () => void;
  errorLabel?: string;
  retryLabel?: string;
  loadingLabel?: string;
  triggerClassName?: string;
  'aria-label'?: string;
}

const OPTION_ROW_CLASSES = 'relative flex-col items-start gap-0.5';
const SECTION_LABEL_CLASSES = 'text-xs uppercase tracking-wide';
const LOCK_GLYPH_CLASSES = 'h-3.5 w-3.5 text-(--muted-foreground)';
const FOOTNOTE_CLASSES = 'px-2 py-1.5 text-xs text-(--muted-foreground)';
const FALLBACK_LABEL = '—';

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

/**
 * Intent-first model picker menu: primary intent rows, an optional effort
 * submenu, an optional catalogue of advanced models, and an optional upsell
 * footer. All copy arrives via props.
 */
export function ModelMenu({
  primary,
  value,
  onSelect,
  effort,
  moreModels,
  footerCta,
  lockedHint,
  inlineSections = false,
  triggerLabel,
  triggerDetail,
  status = 'ready',
  onRetry,
  errorLabel,
  retryLabel,
  loadingLabel,
  triggerClassName,
  'aria-label': ariaLabel,
}: ModelMenuProps) {
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const triggerText = isLoading ? (loadingLabel ?? triggerLabel) : triggerLabel;
  const composedAriaLabel = ariaLabel
    ? `${ariaLabel}: ${triggerText}${triggerDetail ? `, ${triggerDetail}` : ''}`
    : undefined;
  const effortValueLabel = effort?.options.find(
    (o) => o.id === effort.value
  )?.label;

  const effortSection = effort ? (
    <>
      <DropdownMenuRadioGroup
        value={effort.value}
        onValueChange={effort.onChange}
      >
        {effort.options.map((option) => (
          <DropdownMenuRadioItem
            key={option.id}
            value={option.id}
            className={OPTION_ROW_CLASSES}
          >
            <OptionRow label={option.label} description={option.description} />
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {effort.footnote && (
        <div className={FOOTNOTE_CLASSES}>{effort.footnote}</div>
      )}
    </>
  ) : null;
  const moreModelsSection = moreModels ? (
    <>
      <DropdownMenuRadioGroup
        {...(value !== null && { value })}
        onValueChange={onSelect}
      >
        {moreModels.groups.map((group, index) => (
          <Fragment key={group.label}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs uppercase tracking-wide">
              {group.label}
            </DropdownMenuLabel>
            {group.options.map((model) => (
              <DropdownMenuRadioItem
                key={model.id}
                value={model.id}
                className={OPTION_ROW_CLASSES}
              >
                <OptionRow
                  label={model.label}
                  description={model.description}
                  cost={model.cost}
                  badge={
                    model.billedBadge ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-(--muted) px-1.5 py-0.5 text-[10px] font-normal text-(--muted-foreground)">
                        <KeyRound className="h-2.5 w-2.5" />
                        {model.billedBadge}
                      </span>
                    ) : undefined
                  }
                />
              </DropdownMenuRadioItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuRadioGroup>
    </>
  ) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('min-w-0 max-w-full gap-1.5', triggerClassName)}
          disabled={isLoading}
          aria-label={composedAriaLabel}
        >
          {isLoading && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-60 motion-reduce:animate-none" />
          )}
          <span className="truncate">{triggerText}</span>
          {triggerDetail && (
            <span className="shrink-0 whitespace-nowrap text-(--muted-foreground)">
              · {triggerDetail}
            </span>
          )}
          {!isLoading && (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        className="w-72 max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto"
      >
        {isError ? (
          <>
            <div className={FOOTNOTE_CLASSES}>
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
            <DropdownMenuRadioGroup
              {...(value !== null && { value })}
              onValueChange={onSelect}
            >
              {primary.map((row) =>
                row.locked ? (
                  <DropdownMenuItem
                    key={row.id}
                    className={cn(OPTION_ROW_CLASSES, 'pr-7')}
                    // Inert without a CTA behind it, so it announces as disabled
                    // rather than closing the menu and doing nothing.
                    disabled={!footerCta}
                    {...(footerCta && { onSelect: footerCta.onClick })}
                    {...(lockedHint && {
                      'aria-label': `${row.label}, ${lockedHint}`,
                    })}
                  >
                    <OptionRow
                      label={row.label}
                      description={row.description}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Lock className={LOCK_GLYPH_CLASSES} />
                    </span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuRadioItem
                    key={row.id}
                    value={row.id}
                    className={OPTION_ROW_CLASSES}
                  >
                    <OptionRow
                      label={row.label}
                      description={row.description}
                    />
                  </DropdownMenuRadioItem>
                )
              )}
            </DropdownMenuRadioGroup>
            {(effort || moreModels) && <DropdownMenuSeparator />}
            {effort &&
              (effort.locked ? (
                <DropdownMenuItem
                  disabled
                  className="justify-between opacity-50"
                >
                  <span>{effort.label}</span>
                  <Lock className={LOCK_GLYPH_CLASSES} />
                </DropdownMenuItem>
              ) : !inlineSections ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span className="flex-1">{effort.label}</span>
                    {effortValueLabel && (
                      <span className="font-normal text-(--muted-foreground)">
                        {effortValueLabel}
                      </span>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    {effortSection}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <>
                  <DropdownMenuLabel className={SECTION_LABEL_CLASSES}>
                    {effort.label}
                  </DropdownMenuLabel>
                  {effortSection}
                </>
              ))}
            {moreModels &&
              (!inlineSections ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span className="flex-1">{moreModels.label}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    {moreModelsSection}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className={SECTION_LABEL_CLASSES}>
                    {moreModels.label}
                  </DropdownMenuLabel>
                  {moreModelsSection}
                </>
              ))}
          </>
        )}
        {footerCta && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={footerCta.onClick}
              className="w-full text-(--primary) data-[highlighted]:text-(--primary)"
            >
              {footerCta.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
