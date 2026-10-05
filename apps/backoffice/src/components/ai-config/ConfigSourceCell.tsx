import type { ReactNode } from 'react';

import type { AiConfigEntry } from '@knowtis/data-access-admin';
import { Badge, Button } from '@knowtis/design-system';
import type { AIConfigSource } from '@knowtis/shared-types';

const SOURCE_BADGE_VARIANTS = {
  custom: 'default',
  default: 'outline',
  stale: 'destructive',
} as const satisfies Record<AIConfigSource, string>;

const PIN_SOURCE_LABELS = {
  custom: 'pinned',
  default: 'auto',
  stale: 'stale',
} as const satisfies Record<AIConfigSource, string>;

const RESET_LABEL = 'Reset to default';
const RELEASE_LABEL = 'Release pin';

interface ConfigSourceCellProps {
  entry: AiConfigEntry;
  /** Human name of the setting, spoken as part of the action button's accessible name. */
  label: string;
  disabled: boolean;
  onReset: () => void;
  meta?: ReactNode;
  /** A model or chain setting: no row means auto, a row is a pin, and resetting releases it. */
  pinnable?: boolean;
}

export function ConfigSourceCell({
  entry,
  label,
  disabled,
  onReset,
  meta,
  pinnable = false,
}: ConfigSourceCellProps) {
  const actionLabel = pinnable ? RELEASE_LABEL : RESET_LABEL;

  return (
    <div className="flex items-center gap-2">
      <Badge variant={SOURCE_BADGE_VARIANTS[entry.source]}>
        {pinnable ? PIN_SOURCE_LABELS[entry.source] : entry.source}
      </Badge>
      {entry.source === 'stale' ? (
        <span className="text-xs text-(--muted-foreground)">
          stored <span className="font-mono">{entry.storedValue}</span> is no
          longer served
        </span>
      ) : null}
      {meta}
      {entry.source === 'default' ? null : (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`${actionLabel}: ${label}`}
          onClick={onReset}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
