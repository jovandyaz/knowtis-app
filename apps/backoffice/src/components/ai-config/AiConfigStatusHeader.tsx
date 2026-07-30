import { useId } from 'react';

import {
  useAiHealth,
  useGlobalAiUsage,
  useUpsertFeatureFlag,
} from '@knowtis/data-access-admin';
import { useFeatureFlags } from '@knowtis/data-access-feature-flags';
import { Badge, Switch } from '@knowtis/design-system';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

interface AiConfigStatusHeaderProps {
  defaultModel: string | null;
}

export function AiConfigStatusHeader({
  defaultModel,
}: AiConfigStatusHeaderProps) {
  const flags = useFeatureFlags();
  const upsert = useUpsertFeatureFlag();
  const health = useAiHealth();
  const usage = useGlobalAiUsage();

  const masterFlag = flags.data?.find(
    (flag) => flag.key === FEATURE_FLAG_KEYS.AI_ENABLED
  );
  const masterEnabled = masterFlag?.enabled ?? false;
  const masterStateUnknown = !masterFlag && (flags.isLoading || flags.isError);
  const masterHintId = useId();
  const cooling = Object.entries(health.data?.providers ?? {})
    .filter(([, provider]) => provider.cooling)
    .map(([name]) => name);

  return (
    <div className="sticky top-14 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-(--border) bg-(--background) py-3 md:top-0">
      <label className="flex items-center gap-2 text-sm font-medium">
        AI enabled
        <Switch
          checked={masterEnabled}
          disabled={upsert.isPending || masterStateUnknown}
          aria-describedby={masterStateUnknown ? masterHintId : undefined}
          onCheckedChange={(enabled) =>
            upsert.mutate({
              key: FEATURE_FLAG_KEYS.AI_ENABLED,
              enabled,
              ...(masterFlag && masterFlag.description !== null
                ? { description: masterFlag.description }
                : {}),
            })
          }
        />
      </label>
      {masterStateUnknown ? (
        <Badge id={masterHintId} variant="outline">
          state unknown
        </Badge>
      ) : null}
      {defaultModel ? (
        <span className="font-mono text-xs text-(--muted-foreground)">
          {defaultModel}
        </span>
      ) : null}
      {health.data ? (
        cooling.length === 0 ? (
          <Badge variant="outline">Providers healthy</Badge>
        ) : (
          <Badge>Cooling: {cooling.join(', ')}</Badge>
        )
      ) : null}
      {usage.data ? (
        <span className="text-xs text-(--muted-foreground)">
          ${usage.data.totalCostUsd.toFixed(2)} today
        </span>
      ) : null}
    </div>
  );
}
