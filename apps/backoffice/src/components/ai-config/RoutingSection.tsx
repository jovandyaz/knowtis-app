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
import {
  CHAIN_SEPARATOR,
  MODEL_TIERS,
  parseChain,
} from '@knowtis/shared-types';

import { ConfigSection } from './ConfigSection';
import { ConfigSourceCell } from './ConfigSourceCell';

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
  // Cross-guard: a PUT and a DELETE on the same key must not race.
  const mutating = setConfig.isPending || resetConfig.isPending;
  // A draft keeps a reorder to one write, and `base` drops it if another admin
  // writes meanwhile — saving it would silently revert them.
  const [draft, setDraft] = useState<{ base: string; chain: string[] } | null>(
    null
  );

  // Edit what is stored, not what routes: on a stale row `value` is the filtered
  // chain, and saving from it would silently drop the member the admin wrote.
  const stored = entry.storedValue ?? entry.value;
  const saved = parseChain(stored);
  const isForked = draft?.base === stored;
  const chain = isForked ? draft.chain : saved;
  const isDirty = isForked && draft.chain.join(CHAIN_SEPARATOR) !== stored;
  const edit = (next: string[]) => setDraft({ base: stored, chain: next });
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
      <ConfigSourceCell
        entry={entry}
        label="fallback chain"
        disabled={mutating}
        onReset={() => resetConfig.mutate({ key: entry.key })}
        meta={
          <span className="text-xs text-(--muted-foreground)">
            {entry.updatedAt
              ? `Updated ${entry.updatedAt.toLocaleDateString()}`
              : 'Never changed'}
          </span>
        }
      />
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
                disabled={index === 0 || mutating}
                onClick={() => edit(move(chain, index, index - 1))}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${labelFor(id)} later`}
                disabled={index === chain.length - 1 || mutating}
                onClick={() => edit(move(chain, index, index + 1))}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${labelFor(id)}`}
                disabled={mutating}
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
          Models marked “won’t route” are skipped. A member whose provider has
          no server key or is disabled stays in the chain and resumes if that
          changes; one the catalog dropped blocks saving until it is removed.
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
          disabled={mutating || available.length === 0}
          onSelect={(id) => edit([...chain, id])}
        />
        {isDirty ? (
          <>
            <Button
              disabled={mutating || chain.length === 0 || isInert}
              onClick={() =>
                setConfig.mutate({
                  key: entry.key,
                  value: chain.join(CHAIN_SEPARATOR),
                })
              }
            >
              Save chain
            </Button>
            <Button
              variant="ghost"
              disabled={mutating}
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
