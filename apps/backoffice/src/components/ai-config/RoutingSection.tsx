import { useState } from 'react';

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
  const resetConfig = useResetAiConfig();
  // A draft keeps a reorder to one write, and `base` drops it if another admin
  // writes meanwhile — saving it would silently revert them.
  const [draft, setDraft] = useState<{ base: string; chain: string[] } | null>(
    null
  );

  const saved = parseChain(entry.value);
  const isForked = draft?.base === entry.value;
  const chain = isForked ? draft.chain : saved;
  const isDirty = isForked && draft.chain.join(',') !== entry.value;
  const edit = (next: string[]) => setDraft({ base: entry.value, chain: next });
  const available = (models.data ?? []).filter(
    (model) => !chain.includes(model.id)
  );
  const labelFor = (id: string) =>
    models.data?.find((model) => model.id === id)?.label ?? id;
  // Routing skips members the server cannot invoke — a retired model, a keyless
  // or disabled provider, or one only a personal BYOK key reaches. Absence from
  // the catalog covers the first; routableByServer covers the rest.
  const isRoutable = (id: string) =>
    !models.data ||
    (models.data.find((model) => model.id === id)?.routableByServer ?? false);
  const hasInertMembers = chain.some((id) => !isRoutable(id));
  // The server rejects a chain no model can route, so Save would only fail.
  const isInert = chain.length > 0 && !chain.some((id) => isRoutable(id));

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
        <Badge variant={entry.source === 'custom' ? 'default' : 'outline'}>
          {entry.source}
        </Badge>
        <span className="text-xs text-(--muted-foreground)">
          {entry.updatedAt
            ? `Updated ${entry.updatedAt.toLocaleString()}`
            : 'Never changed'}
        </span>
        {entry.source === 'custom' ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={resetConfig.isPending}
            onClick={() => resetConfig.mutate({ key: entry.key })}
          >
            Reset to default
          </Button>
        ) : null}
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
                    <Badge variant="outline">won’t route</Badge>
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
                disabled={index === 0 || setConfig.isPending}
                onClick={() => edit(move(chain, index, index - 1))}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${labelFor(id)} later`}
                disabled={index === chain.length - 1 || setConfig.isPending}
                onClick={() => edit(move(chain, index, index + 1))}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${labelFor(id)}`}
                disabled={setConfig.isPending}
                onClick={() =>
                  edit(chain.filter((_, position) => position !== index))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}
      {isInert ? (
        <p role="status" className="text-xs text-(--destructive)">
          No model here can route, so the server will not accept this chain.
          Give at least one member a key and enable its provider.
        </p>
      ) : hasInertMembers ? (
        <p role="status" className="text-xs text-(--muted-foreground)">
          Models marked “won’t route” are skipped: their provider has no server
          key or is disabled, or the model left the catalog. They stay in the
          chain and resume if that changes.
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
          onSelect={(id) => edit([...chain, id])}
        />
        {isDirty ? (
          <>
            <Button
              disabled={setConfig.isPending || chain.length === 0 || isInert}
              onClick={() =>
                setConfig.mutate({ key: entry.key, value: chain.join(',') })
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
