import {
  useAssignableModels,
  useResetAiConfig,
  useSetAiConfig,
  type AiConfigEntry,
} from '@knowtis/data-access-admin';
import {
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

import { toModelSelectOption } from './assignable-model-options';
import { ConfigSection } from './ConfigSection';
import { ConfigSourceCell } from './ConfigSourceCell';

const KEY_LABELS: Record<string, string> = {
  ai_default_model: 'Default model',
  ai_fast_model: 'Fast model',
  ai_deep_model: 'Deep model',
};

interface ModelsSectionProps {
  entries: AiConfigEntry[];
  onConfigureProviders: () => void;
}

export function ModelsSection({
  entries,
  onConfigureProviders,
}: ModelsSectionProps) {
  const models = useAssignableModels();
  const setConfig = useSetAiConfig();
  const resetConfig = useResetAiConfig();
  // Cross-guard: a PUT and a DELETE on the same key must not race.
  const mutating = setConfig.isPending || resetConfig.isPending;

  const modelStatus = models.isLoading
    ? 'loading'
    : models.isError
      ? 'error'
      : 'ready';
  const options = (models.data ?? []).map(toModelSelectOption);

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
                <div className="flex min-w-0 flex-col">
                  <span title={entry.key}>
                    {KEY_LABELS[entry.key] ?? entry.key}
                  </span>
                  {entry.description && (
                    <span className="text-xs text-(--muted-foreground)">
                      {entry.description}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                  <ModelSelect
                    models={options}
                    value={entry.value}
                    tierOrder={MODEL_TIERS}
                    status={modelStatus}
                    onRetry={() => void models.refetch()}
                    renderDescription={(m) => m.description ?? ''}
                    triggerVariant="outline"
                    disabled={mutating}
                    onSelect={(id) =>
                      setConfig.mutate({ key: entry.key, value: id })
                    }
                  />
                  <span
                    title={entry.value}
                    className="truncate font-mono text-xs text-(--muted-foreground)"
                  >
                    {entry.value}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <ConfigSourceCell
                  entry={entry}
                  label={KEY_LABELS[entry.key] ?? entry.key}
                  disabled={mutating}
                  onReset={() => resetConfig.mutate({ key: entry.key })}
                />
              </TableCell>
              <TableCell>
                {entry.updatedAt?.toLocaleDateString() ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button
        variant="link"
        size="sm"
        className="self-start px-0"
        onClick={onConfigureProviders}
      >
        Configure provider keys
      </Button>
    </ConfigSection>
  );
}
