import { useState } from 'react';

import {
  useSelectableModels,
  useSetAiConfig,
  type AiConfigEntry,
} from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  ModelSelect,
  MutationErrorAlert,
} from '@knowtis/design-system';
import { MODEL_TIERS } from '@knowtis/shared-types';

import { ConfigSection } from './ConfigSection';

function parseChain(value: string): string[] {
  return value
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function move(chain: string[], from: number, to: number): string[] {
  const next = [...chain];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

interface RoutingSectionProps {
  entry: AiConfigEntry;
}

export function RoutingSection({ entry }: RoutingSectionProps) {
  const models = useSelectableModels();
  const setConfig = useSetAiConfig();
  // Reordering is several edits to one value; a draft keeps it to one write
  // and one audit row instead of one per keystroke of intent.
  const [draft, setDraft] = useState<string[] | null>(null);

  const saved = parseChain(entry.value);
  const chain = draft ?? saved;
  const isDirty = draft !== null && draft.join(',') !== saved.join(',');
  const available = (models.data ?? []).filter(
    (model) => !chain.includes(model.id)
  );
  const labelFor = (id: string) =>
    models.data?.find((model) => model.id === id)?.label ?? id;
  // The server drops chain members the catalog no longer lists, so showing them
  // as ordinary entries would advertise fallbacks that never run.
  const isRoutable = (id: string) =>
    !models.data || models.data.some((model) => model.id === id);
  const hasInertMembers = chain.some((id) => !isRoutable(id));

  return (
    <ConfigSection
      title="Routing"
      description="Order the models a turn falls back through when a provider fails. The first one that can route wins."
    >
      <MutationErrorAlert
        error={setConfig.error}
        isError={setConfig.isError}
        fallbackMessage="Could not update the chain."
      />
      <div className="flex items-center gap-2">
        <Badge variant={entry.source === 'database' ? 'default' : 'outline'}>
          {entry.source}
        </Badge>
        <span className="text-xs text-(--muted-foreground)">
          {entry.updatedAt
            ? `Updated ${entry.updatedAt.toLocaleString()}`
            : 'Never changed'}
        </span>
      </div>
      {chain.length === 0 ? (
        <p className="text-sm text-(--muted-foreground)">
          The chain is empty. Add at least one model before saving.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {chain.map((id, index) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-md border border-(--border) p-2"
            >
              <Badge variant="outline">{index + 1}</Badge>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 truncate text-sm">
                  {labelFor(id)}
                  {isRoutable(id) ? null : (
                    <Badge variant="destructive">not in catalog</Badge>
                  )}
                </span>
                <span className="truncate font-mono text-xs text-(--muted-foreground)">
                  {id}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${labelFor(id)} earlier`}
                disabled={index === 0}
                onClick={() => setDraft(move(chain, index, index - 1))}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${labelFor(id)} later`}
                disabled={index === chain.length - 1}
                onClick={() => setDraft(move(chain, index, index + 1))}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${labelFor(id)}`}
                onClick={() =>
                  setDraft(chain.filter((_, position) => position !== index))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}
      {hasInertMembers ? (
        <p role="alert" className="text-xs text-(--destructive)">
          Models marked “not in catalog” are skipped at routing time. Remove
          them so the chain reflects what actually runs.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <ModelSelect
          models={available}
          value={null}
          tierOrder={MODEL_TIERS}
          status={
            models.isLoading ? 'loading' : models.isError ? 'error' : 'ready'
          }
          onRetry={() => void models.refetch()}
          triggerVariant="outline"
          triggerLabel="Add model"
          disabled={setConfig.isPending || available.length === 0}
          onSelect={(id) => setDraft([...chain, id])}
        />
        {isDirty ? (
          <>
            <Button
              disabled={setConfig.isPending || chain.length === 0}
              onClick={() =>
                setConfig.mutate(
                  { key: entry.key, value: chain.join(',') },
                  { onSuccess: () => setDraft(null) }
                )
              }
            >
              Save chain
            </Button>
            <Button
              variant="ghost"
              disabled={setConfig.isPending}
              onClick={() => setDraft(null)}
            >
              Discard
            </Button>
          </>
        ) : null}
      </div>
    </ConfigSection>
  );
}
