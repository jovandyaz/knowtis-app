import type { ReactNode } from 'react';

import type { AiConfigEntry } from '@knowtis/data-access-admin';
import { Badge, Button } from '@knowtis/design-system';
import type { AIConfigSource } from '@knowtis/shared-types';

const SOURCE_BADGE_VARIANTS = {
  custom: 'default',
  default: 'outline',
  stale: 'destructive',
} as const satisfies Record<AIConfigSource, string>;

interface ConfigSourceCellProps {
  entry: AiConfigEntry;
  /** Human name of the setting, spoken as part of the Reset button's accessible name. */
  label: string;
  disabled: boolean;
  onReset: () => void;
  meta?: ReactNode;
}

export function ConfigSourceCell({
  entry,
  label,
  disabled,
  onReset,
  meta,
}: ConfigSourceCellProps) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant={SOURCE_BADGE_VARIANTS[entry.source]}>
        {entry.source}
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
          aria-label={`Reset ${label} to default`}
          onClick={onReset}
        >
          Reset to default
        </Button>
      )}
    </div>
  );
}
