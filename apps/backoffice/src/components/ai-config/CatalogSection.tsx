import { useState } from 'react';

import { formatUsdPerMillionTokens } from '@/lib/format';

import {
  useAiCatalog,
  usePromoteCatalogModel,
  useResolveCatalogAlert,
  useRetireCatalogModel,
  useUpdateCatalogCopy,
  type CatalogModel,
} from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  MutationErrorAlert,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';
import {
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_LABEL_MAX_LENGTH,
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  type CatalogAlertKind,
  type ModelTier,
} from '@knowtis/shared-types';

import { ConfigSection } from './ConfigSection';

/** Only open-weight models reach the candidate list, so promotion always joins the open pool. */
const PROMOTION_TIER = 'open' as const satisfies ModelTier;

const ALERT_KIND_LABELS: Record<string, string> = {
  deprecation: 'Deprecation',
  price_drift: 'Price drift',
} satisfies Record<CatalogAlertKind, string>;

/** Unscored last: two thirds of the upstream list carry no index, and an unscored model is not a better bet than a scored one. */
function byIntelligenceDesc(a: CatalogModel, b: CatalogModel): number {
  if (a.intelligenceIndex === null) {
    return b.intelligenceIndex === null ? 0 : 1;
  }
  if (b.intelligenceIndex === null) {
    return -1;
  }
  return b.intelligenceIndex - a.intelligenceIndex;
}

/** Mirrors the server's access policy, where a negative stored price is a broken row rather than a discount. */
function isByokOnly(model: CatalogModel): boolean {
  return (
    model.outputCostPerToken < 0 ||
    model.outputCostPerToken > FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
  );
}

interface PromotedModelRowProps {
  model: CatalogModel;
  disabled: boolean;
  onSave: (label: string, description: string) => void;
  onRetire: () => void;
}

function PromotedModelRow({
  model,
  disabled,
  onSave,
  onRetire,
}: PromotedModelRowProps) {
  // A draft holds the edit and `base` drops it if another admin writes
  // meanwhile — saving over their change would silently revert it.
  const [draft, setDraft] = useState<{
    base: string;
    label: string;
    description: string;
  } | null>(null);

  const saved = `${model.label}\n${model.description}`;
  const isForked = draft?.base === saved;
  const label = isForked ? draft.label : model.label;
  const description = isForked ? draft.description : model.description;
  const isDirty = isForked && `${label}\n${description}` !== saved;
  const edit = (next: { label?: string; description?: string }) =>
    setDraft({ base: saved, label, description, ...next });

  return (
    <TableRow>
      <TableCell>
        <span className="font-mono text-xs text-(--muted-foreground)">
          {model.id}
        </span>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`Label for ${model.id}`}
          value={label}
          maxLength={CATALOG_LABEL_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => edit({ label: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`Description for ${model.id}`}
          value={description}
          maxLength={CATALOG_DESCRIPTION_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => edit({ description: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {isDirty ? (
            <Button
              size="sm"
              disabled={disabled}
              aria-label={`Save ${model.label}`}
              onClick={() => onSave(label, description)}
            >
              Save
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Retire ${model.label}`}
            onClick={onRetire}
          >
            Retire
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CatalogSection() {
  const catalog = useAiCatalog();
  const promote = usePromoteCatalogModel();
  const retire = useRetireCatalogModel();
  const updateCopy = useUpdateCatalogCopy();
  const resolveAlert = useResolveCatalogAlert();

  const mutations = [promote, retire, updateCopy, resolveAlert];
  const mutating = mutations.some((mutation) => mutation.isPending);
  const failed = mutations.find((mutation) => mutation.isError);

  const candidates = [...(catalog.data?.candidates ?? [])].sort(
    byIntelligenceDesc
  );
  const promoted = catalog.data?.promoted ?? [];
  const alerts = catalog.data?.alerts ?? [];

  return (
    <ConfigSection
      title="Model catalog"
      description="Open-weight models the sync found upstream. Promoting one publishes it to the model list; its stored price still decides who may run it."
    >
      {catalog.isError ? (
        <ErrorState
          message="Could not load the model catalog."
          onRetry={() => void catalog.refetch()}
          fullHeight={false}
        />
      ) : catalog.isLoading || !catalog.data ? (
        <LoadingState />
      ) : (
        <>
          <MutationErrorAlert
            error={failed?.error ?? null}
            isError={!!failed}
            fallbackMessage="Could not apply the catalog change."
          />

          {alerts.length > 0 ? (
            <Card className="flex min-w-0 flex-col gap-2 p-4">
              <h3 className="text-sm font-medium text-(--muted-foreground)">
                Open alerts
              </h3>
              <ul className="flex flex-col gap-2">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Badge variant="outline">
                      {ALERT_KIND_LABELS[alert.kind] ?? alert.kind}
                    </Badge>
                    <span className="font-mono text-xs text-(--muted-foreground)">
                      {alert.modelId}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      {alert.detail}
                    </span>
                    <span className="text-xs text-(--muted-foreground)">
                      {alert.createdAt.toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={mutating}
                      aria-label={`Resolve ${alert.kind} alert for ${alert.modelId}`}
                      onClick={() => resolveAlert.mutate(alert.id)}
                    >
                      Resolve
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* min-w-0 on the card: grid and flex items default to min-width:auto,
              so a wide table widens the page instead of scrolling inside it. */}
          <Card className="flex min-w-0 flex-col gap-3 p-4">
            <h3 className="text-sm font-medium text-(--muted-foreground)">
              Candidates ({candidates.length})
            </h3>
            <p className="text-xs text-(--muted-foreground)">
              Ranked by intelligence index, unscored last. A model marked “BYOK
              only” costs more per token than the free tier absorbs: promoting
              it offers it to users who bring their own key, not to everyone.
            </p>
            {candidates.length === 0 ? (
              <EmptyState
                title="No candidates"
                description="The sync has not stored a promotable model yet."
                fullHeight={false}
              />
            ) : (
              <Table aria-label="Catalog candidates">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Model</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Intelligence
                    </TableHead>
                    <TableHead className="whitespace-nowrap">$/M in</TableHead>
                    <TableHead className="whitespace-nowrap">$/M out</TableHead>
                    <TableHead className="whitespace-nowrap">Context</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Last seen
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <span className="flex flex-wrap items-center gap-2">
                            {model.label}
                            {isByokOnly(model) ? (
                              <Badge variant="outline">BYOK only</Badge>
                            ) : null}
                          </span>
                          <span className="font-mono text-xs text-(--muted-foreground)">
                            {model.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {model.intelligenceIndex ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatUsdPerMillionTokens(model.inputCostPerToken)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatUsdPerMillionTokens(model.outputCostPerToken)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {model.maxInputTokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {model.lastSeenAt.toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={mutating}
                          aria-label={`Promote ${model.label}`}
                          onClick={() =>
                            promote.mutate({
                              id: model.id,
                              tier: PROMOTION_TIER,
                            })
                          }
                        >
                          Promote
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="flex min-w-0 flex-col gap-3 p-4">
            <h3 className="text-sm font-medium text-(--muted-foreground)">
              Promoted ({promoted.length})
            </h3>
            {promoted.length === 0 ? (
              <EmptyState
                title="No promoted model"
                description="Promote a candidate to offer it in the model list."
                fullHeight={false}
              />
            ) : (
              <Table aria-label="Promoted models">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Model</TableHead>
                    <TableHead className="whitespace-nowrap">Label</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Description
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promoted.map((model) => (
                    <PromotedModelRow
                      key={model.id}
                      model={model}
                      disabled={mutating}
                      onSave={(label, description) =>
                        updateCopy.mutate({
                          id: model.id,
                          patch: { label, description },
                        })
                      }
                      onRetire={() => retire.mutate(model.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </ConfigSection>
  );
}
