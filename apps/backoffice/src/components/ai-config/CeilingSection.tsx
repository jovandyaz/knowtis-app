import {
  useResetAiConfig,
  useSetAiConfig,
  type AiConfigEntry,
} from '@knowtis/data-access-admin';
import {
  Button,
  FormField,
  Input,
  MutationErrorAlert,
} from '@knowtis/design-system';
import {
  CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN,
  TOKENS_PER_MILLION,
  USD_PER_MILLION_FORMAT,
} from '@knowtis/shared-types';

import { ConfigSection } from './ConfigSection';
import { ConfigSourceCell } from './ConfigSourceCell';
import { useForkedDraft } from './useForkedDraft';

const CEILING_INPUT_ID = 'ai-free-tier-ceiling';
const MAX_CEILING_USD_PER_MILLION =
  CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN * TOKENS_PER_MILLION;

function validate(value: string): string | null {
  const trimmed = value.trim();
  if (!USD_PER_MILLION_FORMAT.test(trimmed)) {
    return 'Dollars per million output tokens, up to two decimals.';
  }
  if (Number(trimmed) > MAX_CEILING_USD_PER_MILLION) {
    return `At most $${MAX_CEILING_USD_PER_MILLION} — the price past which nothing enters the catalog.`;
  }
  return null;
}

interface CeilingSectionProps {
  entry: AiConfigEntry;
}

export function CeilingSection({ entry }: CeilingSectionProps) {
  const setConfig = useSetAiConfig();
  const resetConfig = useResetAiConfig();
  // Cross-guard: a PUT and a DELETE on the same key must not race.
  const mutating = setConfig.isPending || resetConfig.isPending;
  const { value, isDirty, edit, discard } = useForkedDraft(entry.value);
  const error = validate(value);

  return (
    <ConfigSection
      title="Free tier"
      description="The output price the platform absorbs, in dollars per million tokens. Models at or under it serve every signed-in user; anything above is BYOK only."
    >
      <MutationErrorAlert
        error={setConfig.error}
        isError={setConfig.isError}
        fallbackMessage="Could not update the free-tier ceiling."
      />
      <ConfigSourceCell
        entry={entry}
        label="free-tier ceiling"
        disabled={mutating}
        onReset={() => resetConfig.mutate({ key: entry.key })}
      />
      <FormField
        id={CEILING_INPUT_ID}
        label="Ceiling ($/M output)"
        error={error ?? undefined}
      >
        <Input
          id={CEILING_INPUT_ID}
          value={value}
          disabled={mutating}
          inputMode="decimal"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={
            error !== null ? `${CEILING_INPUT_ID}-error` : undefined
          }
          onChange={(event) => edit(event.target.value)}
        />
      </FormField>
      <p className="text-xs text-(--muted-foreground)">
        Applies within a minute. The catalog tables below re-mark “BYOK only”
        against the value you save.
      </p>
      {isDirty ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={mutating || error !== null}
            onClick={() =>
              setConfig.mutate(
                { key: entry.key, value: value.trim() },
                { onSuccess: discard }
              )
            }
          >
            Save
          </Button>
          <Button variant="ghost" disabled={mutating} onClick={discard}>
            Discard
          </Button>
        </div>
      ) : null}
    </ConfigSection>
  );
}
