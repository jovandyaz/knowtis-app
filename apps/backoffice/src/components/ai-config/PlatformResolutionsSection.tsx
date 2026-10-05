import { useState } from 'react';

import {
  usePlatformResolutions,
  useResetAiConfig,
  useRollbackResolution,
  type PlatformResolution,
} from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  buttonVariants,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  LoadingState,
  MutationErrorAlert,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@knowtis/design-system';
import type {
  AIConfigSource,
  ModelGateStatus,
  ModelIntent,
  RollbackResolutionInput,
} from '@knowtis/shared-types';

import { ConfigSection } from './ConfigSection';
import { ConfigSourceBadge, RELEASE_LABEL } from './ConfigSourceCell';

const INTENT_LABELS: Record<string, string> = {
  fast: 'Fast',
  balanced: 'Balanced',
  powerful: 'Powerful',
} satisfies Record<ModelIntent, string>;

const GATE_STATUS_LABELS = {
  pending: 'gate pending',
  failed: 'gate failed',
} as const satisfies Record<ModelGateStatus, string>;

const GATE_STATUS_BADGE_VARIANTS = {
  pending: 'outline',
  failed: 'destructive',
} as const satisfies Record<ModelGateStatus, string>;

const ROLL_BACK_LABEL = 'Roll back';
const GATE_RUN_LABEL = 'Gate run';
const SAFE_RUN_URL_PREFIX = 'https://';

// The overview carries the stored pin and the served model, not the config
// source: a pin the runtime cannot serve leaves the intent serving another one.
function pinSourceOf({ pin, served }: PlatformResolution): AIConfigSource {
  if (pin === null) {
    return 'default';
  }
  return pin === served ? 'custom' : 'stale';
}

function ModelId({ id }: { id: string }) {
  return (
    <span title={id} className="block max-w-56 truncate font-mono text-xs">
      {id}
    </span>
  );
}

interface ResolutionRowProps {
  resolution: PlatformResolution;
  disabled: boolean;
  onReleasePin: () => void;
  onRollBack: (confirmed: RollbackResolutionInput) => void;
}

function ResolutionRow({
  resolution,
  disabled,
  onReleasePin,
  onRollBack,
}: ResolutionRowProps) {
  const [confirmingRollBack, setConfirmingRollBack] = useState(false);
  const {
    activeModelId,
    previousModelId,
    pendingModelId,
    gateStatus,
    gateDetail,
    gateRunUrl,
  } = resolution;
  const intentLabel = INTENT_LABELS[resolution.intent] ?? resolution.intent;
  const runUrl = gateRunUrl?.startsWith(SAFE_RUN_URL_PREFIX)
    ? gateRunUrl
    : null;

  return (
    <TableRow>
      <TableCell>
        <span title={resolution.selectorKey}>{intentLabel}</span>
      </TableCell>
      <TableCell>
        <ConfigSourceBadge source={pinSourceOf(resolution)} pinnable />
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <ModelId id={resolution.served} />
          {resolution.releasedModelId ? (
            <span className="text-xs text-(--muted-foreground)">
              released{' '}
              <span className="font-mono">{resolution.releasedModelId}</span>
              {resolution.releasedAt
                ? ` on ${resolution.releasedAt.toLocaleDateString()}`
                : null}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <ModelId id={activeModelId} />
          {resolution.changedAt ? (
            <span className="text-xs text-(--muted-foreground)">
              since {resolution.changedAt.toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {pendingModelId ? (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <ModelId id={pendingModelId} />
            {gateStatus ? (
              <Badge variant={GATE_STATUS_BADGE_VARIANTS[gateStatus]}>
                {GATE_STATUS_LABELS[gateStatus]}
              </Badge>
            ) : null}
            {gateDetail ? (
              <span className="max-w-64 text-xs wrap-break-word text-(--muted-foreground)">
                {gateDetail}
              </span>
            ) : null}
            {runUrl ? (
              <a
                href={runUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`${GATE_RUN_LABEL}: ${intentLabel}`}
                className={buttonVariants({
                  variant: 'link',
                  size: 'sm',
                  className: 'h-auto px-0',
                })}
              >
                {GATE_RUN_LABEL}
              </a>
            ) : null}
          </div>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>
        {resolution.candidateModelId ? (
          <ModelId id={resolution.candidateModelId} />
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {resolution.pin === null ? null : (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`${RELEASE_LABEL}: ${intentLabel}`}
              onClick={onReleasePin}
            >
              {RELEASE_LABEL}
            </Button>
          )}
          {previousModelId ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={`${ROLL_BACK_LABEL}: ${intentLabel}`}
                onClick={() => setConfirmingRollBack(true)}
              >
                {ROLL_BACK_LABEL}
              </Button>
              <Dialog
                open={confirmingRollBack}
                onOpenChange={setConfirmingRollBack}
              >
                <DialogContent closeLabel="Close dialog">
                  <DialogHeader>
                    <DialogTitle>Roll back {intentLabel}?</DialogTitle>
                    <DialogDescription>
                      The active model goes back from{' '}
                      <span className="font-mono">{activeModelId}</span> to{' '}
                      <span className="font-mono">{previousModelId}</span>. Auto
                      mode can bring{' '}
                      <span className="font-mono">{activeModelId}</span> back
                      after the next sync and gate run. To keep{' '}
                      <span className="font-mono">{previousModelId}</span>, pin
                      it.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmingRollBack(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={disabled}
                      onClick={() => {
                        setConfirmingRollBack(false);
                        onRollBack({ activeModelId, previousModelId });
                      }}
                    >
                      {ROLL_BACK_LABEL}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function PlatformResolutionsSection() {
  const resolutions = usePlatformResolutions();
  const rollback = useRollbackResolution();
  const resetConfig = useResetAiConfig();
  const mutating = rollback.isPending || resetConfig.isPending;

  return (
    <ConfigSection
      title="Platform resolutions"
      description="Which model each intent serves. The daily sync queues a selector's newer pick as pending, and only a passing gate run makes it active. A pin overrides the active model until released."
    >
      {resolutions.isError ? (
        <ErrorState
          message="Could not load the platform resolutions."
          onRetry={() => void resolutions.refetch()}
          fullHeight={false}
        />
      ) : resolutions.data ? (
        <>
          <MutationErrorAlert
            error={rollback.error ?? resetConfig.error}
            isError={rollback.isError || resetConfig.isError}
            fallbackMessage="Could not update the platform resolution."
          />
          <Table aria-label="Platform resolutions">
            <TableHeader>
              <TableRow>
                <TableHead>Intent</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Served</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resolutions.data.intents.map((resolution) => (
                <ResolutionRow
                  key={resolution.selectorKey}
                  resolution={resolution}
                  disabled={mutating}
                  onReleasePin={() => {
                    rollback.reset();
                    resetConfig.mutate({ key: resolution.configKey });
                  }}
                  onRollBack={(confirmed) => {
                    resetConfig.reset();
                    rollback.mutate({
                      selectorKey: resolution.selectorKey,
                      ...confirmed,
                    });
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </>
      ) : (
        <LoadingState />
      )}
    </ConfigSection>
  );
}
