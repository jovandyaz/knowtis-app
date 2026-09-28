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
  AI_CONFIG_KEYS,
  MAX_DAILY_MESSAGE_LIMIT,
  parseDailyMessageLimit,
} from '@knowtis/shared-types';

import { ConfigSection } from './ConfigSection';
import { ConfigSourceCell } from './ConfigSourceCell';
import { useForkedDraft } from './useForkedDraft';

interface LimitField {
  label: string;
  inputId: string;
  hint?: string;
}

const LIMIT_FIELDS: Record<string, LimitField> = {
  [AI_CONFIG_KEYS.ANON_DAILY_MESSAGES]: {
    label: 'Guests (per session and per IP)',
    inputId: 'ai-anon-daily-messages',
    hint: '0 turns the guest copilot off.',
  },
  [AI_CONFIG_KEYS.FREE_DAILY_MESSAGES]: {
    label: 'Signed-in users',
    inputId: 'ai-free-daily-messages',
  },
};

const RANGE_ERROR = `A whole number from 0 to ${MAX_DAILY_MESSAGE_LIMIT}.`;

interface MessageLimitsSectionProps {
  entries: readonly AiConfigEntry[];
}

export function MessageLimitsSection({ entries }: MessageLimitsSectionProps) {
  return (
    <ConfigSection
      title="Daily messages"
      description="Copilot messages each caller gets per UTC day on platform-paid models. Turns billed to a user's own key never count."
    >
      <div className="flex flex-col gap-6">
        {entries.map((entry) => (
          <MessageLimitField key={entry.key} entry={entry} />
        ))}
      </div>
    </ConfigSection>
  );
}

function MessageLimitField({ entry }: { entry: AiConfigEntry }) {
  const setConfig = useSetAiConfig();
  const resetConfig = useResetAiConfig();
  // Cross-guard: a PUT and a DELETE on the same key must not race.
  const mutating = setConfig.isPending || resetConfig.isPending;
  const { value, isDirty, edit, discard } = useForkedDraft(entry.value);
  const error = parseDailyMessageLimit(value) === null ? RANGE_ERROR : null;
  const { label, inputId, hint } = LIMIT_FIELDS[entry.key] ?? {
    label: entry.key,
    inputId: entry.key,
  };
  const describedBy =
    [
      hint ? `${inputId}-hint` : null,
      error !== null ? `${inputId}-error` : null,
    ]
      .filter((id): id is string => id !== null)
      .join(' ') || undefined;

  return (
    <div className="flex flex-col gap-2">
      <MutationErrorAlert
        error={setConfig.error}
        isError={setConfig.isError}
        fallbackMessage="Could not update the daily message limit."
      />
      <ConfigSourceCell
        entry={entry}
        label={label}
        disabled={mutating}
        onReset={() => resetConfig.mutate({ key: entry.key })}
      />
      <FormField id={inputId} label={label} error={error ?? undefined}>
        <Input
          id={inputId}
          value={value}
          disabled={mutating}
          inputMode="numeric"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={describedBy}
          onChange={(event) => edit(event.target.value)}
        />
      </FormField>
      {hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-(--muted-foreground)">
          {hint}
        </p>
      ) : null}
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
    </div>
  );
}
