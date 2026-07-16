import {
  useAiConfig,
  useSelectableModels,
  useSetAiConfig,
} from '@knowtis/data-access-admin';
import {
  Badge,
  ErrorState,
  LoadingState,
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

const KEY_LABELS: Record<string, string> = {
  ai_default_model: 'Default model',
  ai_fast_model: 'Fast model',
};

export function AiConfigPage() {
  const config = useAiConfig();
  const models = useSelectableModels();
  const setConfig = useSetAiConfig();

  const modelStatus = models.isLoading
    ? 'loading'
    : models.isError
      ? 'error'
      : 'ready';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">AI Config</h1>
      <p className="text-sm text-(--muted-foreground)">
        Effective runtime configuration. Database values override environment
        defaults and apply within 30 seconds — no redeploy.
      </p>
      <MutationErrorAlert
        error={setConfig.error}
        isError={setConfig.isError}
        fallbackMessage="Could not update the config value."
      />
      {config.isError ? (
        <ErrorState
          message="Could not load AI config."
          onRetry={() => void config.refetch()}
          fullHeight={false}
        />
      ) : config.isLoading || !config.data ? (
        <LoadingState />
      ) : (
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
            {config.data.map((entry) => (
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
                    variant={
                      entry.source === 'database' ? 'default' : 'outline'
                    }
                  >
                    {entry.source}
                  </Badge>
                </TableCell>
                <TableCell>
                  {entry.updatedAt?.toLocaleString() ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
