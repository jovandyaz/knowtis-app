import {
  useResetAiConfig,
  useSelectableModels,
  useSetAiConfig,
  type AiConfigEntry,
} from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  ModelSelect,
  MutationErrorAlert,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';
import { MODEL_TIERS } from '@knowtis/shared-types';

import { ConfigSection } from './ConfigSection';

const KEY_LABELS: Record<string, string> = {
  ai_default_model: 'Default model',
  ai_fast_model: 'Fast model',
  ai_deep_model: 'Deep model',
};

const SOURCE_BADGE_VARIANTS = {
  custom: 'default',
  default: 'outline',
  stale: 'destructive',
} as const satisfies Record<AiConfigEntry['source'], string>;

interface ModelsSectionProps {
  entries: AiConfigEntry[];
}

export function ModelsSection({ entries }: ModelsSectionProps) {
  const models = useSelectableModels();
  const setConfig = useSetAiConfig();
  const resetConfig = useResetAiConfig();
  // Cross-guard: a PUT and a DELETE on the same key must not race.
  const mutating = setConfig.isPending || resetConfig.isPending;

  const modelStatus = models.isLoading
    ? 'loading'
    : models.isError
      ? 'error'
      : 'ready';

  return (
    <ConfigSection
      title="Models"
      description="Which model each kind of turn runs on. The default model is what every free-tier client gets."
    >
      <MutationErrorAlert
        error={setConfig.error}
        isError={setConfig.isError}
        fallbackMessage="Could not update the model."
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Setting</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.key}>
              <TableCell>
                <div className="flex flex-col">
                  <span>{KEY_LABELS[entry.key] ?? entry.key}</span>
                  <span className="font-mono text-xs text-(--muted-foreground)">
                    {entry.key}
                  </span>
                  {entry.description && (
                    <span className="text-xs text-(--muted-foreground)">
                      {entry.description}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <ModelSelect
                    models={models.data ?? []}
                    value={entry.value}
                    tierOrder={MODEL_TIERS}
                    status={modelStatus}
                    onRetry={() => void models.refetch()}
                    triggerVariant="outline"
                    disabled={mutating}
                    onSelect={(id) =>
                      setConfig.mutate({ key: entry.key, value: id })
                    }
                  />
                  <span className="font-mono text-xs text-(--muted-foreground)">
                    {entry.value}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={SOURCE_BADGE_VARIANTS[entry.source]}>
                    {entry.source}
                  </Badge>
                  {entry.source === 'stale' ? (
                    <span className="text-xs text-(--muted-foreground)">
                      stored{' '}
                      <span className="font-mono">{entry.storedValue}</span> is
                      no longer served
                    </span>
                  ) : null}
                  {entry.source === 'default' ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={mutating}
                      aria-label={`Reset ${entry.key} to default`}
                      onClick={() => resetConfig.mutate({ key: entry.key })}
                    >
                      Reset to default
                    </Button>
                  )}
                </div>
              </TableCell>
              <TableCell>{entry.updatedAt?.toLocaleString() ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ConfigSection>
  );
}
