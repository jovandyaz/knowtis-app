import {
  useSelectableModels,
  useSetAiConfig,
  type AiConfigEntry,
} from '@knowtis/data-access-admin';
import {
  Badge,
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
};

interface ModelsSectionProps {
  entries: AiConfigEntry[];
}

export function ModelsSection({ entries }: ModelsSectionProps) {
  const models = useSelectableModels();
  const setConfig = useSetAiConfig();

  const modelStatus = models.isLoading
    ? 'loading'
    : models.isError
      ? 'error'
      : 'ready';

  return (
    <ConfigSection
      title="Models"
      description="Which model each kind of turn runs on."
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
                    disabled={setConfig.isPending}
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
                <Badge
                  variant={entry.source === 'database' ? 'default' : 'outline'}
                >
                  {entry.source}
                </Badge>
              </TableCell>
              <TableCell>{entry.updatedAt?.toLocaleString() ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ConfigSection>
  );
}
