import {
  useResetAiConfig,
  useSetAiConfig,
  type AiConfigEntry,
} from '@knowtis/data-access-admin';
import { Button, MutationErrorAlert } from '@knowtis/design-system';
import { GLOBAL_REASONING_EFFORTS } from '@knowtis/shared-types';

import { ConfigSection } from './ConfigSection';
import { ConfigSourceCell } from './ConfigSourceCell';

interface ReasoningSectionProps {
  entry: AiConfigEntry;
}

export function ReasoningSection({ entry }: ReasoningSectionProps) {
  const setConfig = useSetAiConfig();
  const resetConfig = useResetAiConfig();
  // Cross-guard: a PUT and a DELETE on the same key must not race.
  const mutating = setConfig.isPending || resetConfig.isPending;

  return (
    <ConfigSection
      title="Reasoning"
      description="How much hidden thinking reasoning models spend before answering. This is the global default and covers BYOK turns too. Lower answers faster and cheaper; higher digs deeper."
    >
      <MutationErrorAlert
        error={setConfig.error}
        isError={setConfig.isError}
        fallbackMessage="Could not update the reasoning effort."
      />
      <div className="flex flex-wrap items-center gap-2">
        {GLOBAL_REASONING_EFFORTS.map((effort) => (
          <Button
            key={effort}
            variant={entry.value === effort ? 'default' : 'outline'}
            size="sm"
            disabled={mutating}
            aria-pressed={entry.value === effort}
            onClick={() => setConfig.mutate({ key: entry.key, value: effort })}
          >
            {effort}
          </Button>
        ))}
        <ConfigSourceCell
          entry={entry}
          label="reasoning effort"
          disabled={mutating}
          onReset={() => resetConfig.mutate({ key: entry.key })}
        />
      </div>
    </ConfigSection>
  );
}
