import { useState } from 'react';

import {
  useResetAiConfig,
  useSetAiConfig,
  type AiConfigEntry,
} from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  FormField,
  Input,
  MutationErrorAlert,
} from '@knowtis/design-system';

import { ConfigSection } from './ConfigSection';

const OPENROUTER_PROVIDER_SLUG = /^[a-z0-9-]+(\/[a-z0-9.-]+)?$/;
const MAX_OPENROUTER_PROVIDERS = 8;
const UPSTREAMS_INPUT_ID = 'ai-openrouter-upstreams';

function normalizeCsv(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }
  return trimmed
    .split(',')
    .map((slug) => slug.trim())
    .join(',');
}

function validate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const slugs = trimmed.split(',').map((slug) => slug.trim());
  if (slugs.length > MAX_OPENROUTER_PROVIDERS) {
    return `Use at most ${MAX_OPENROUTER_PROVIDERS} providers.`;
  }
  if (slugs.some((slug) => !OPENROUTER_PROVIDER_SLUG.test(slug))) {
    return 'Each provider is a lowercase slug (letters, numbers, hyphens), optionally with a /variant.';
  }
  if (new Set(slugs).size !== slugs.length) {
    return 'Providers must be unique.';
  }
  return null;
}

interface UpstreamSectionProps {
  entry: AiConfigEntry;
}

export function UpstreamSection({ entry }: UpstreamSectionProps) {
  const setConfig = useSetAiConfig();
  const resetConfig = useResetAiConfig();
  // Cross-guard: a PUT and a DELETE on the same key must not race.
  const mutating = setConfig.isPending || resetConfig.isPending;
  // A draft holds the edit and `base` drops it if another admin writes
  // meanwhile — saving over their change would silently revert it.
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(
    null
  );

  const isForked = draft?.base === entry.value;
  const value = isForked ? draft.value : entry.value;
  const isDirty = isForked && draft.value !== entry.value;
  const error = validate(value);

  return (
    <ConfigSection
      title="OpenRouter upstreams"
      description="The upstream providers OpenRouter may route a turn to, tried in order. Applies only to models served through OpenRouter."
    >
      <MutationErrorAlert
        error={setConfig.error}
        isError={setConfig.isError}
        fallbackMessage="Could not update the upstream allowlist."
      />
      <div className="flex items-center gap-2">
        <Badge variant={entry.source === 'custom' ? 'default' : 'outline'}>
          {entry.source}
        </Badge>
        {entry.source === 'custom' ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={mutating}
            onClick={() => resetConfig.mutate({ key: entry.key })}
          >
            Reset to default
          </Button>
        ) : null}
      </div>
      <FormField
        id={UPSTREAMS_INPUT_ID}
        label="Provider allowlist"
        error={error ?? undefined}
      >
        <Input
          id={UPSTREAMS_INPUT_ID}
          value={value}
          disabled={mutating}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          placeholder="fireworks,baseten"
          onChange={(event) =>
            setDraft({ base: entry.value, value: event.target.value })
          }
        />
      </FormField>
      <p className="text-xs text-(--muted-foreground)">
        Comma-separated lowercase slugs, up to {MAX_OPENROUTER_PROVIDERS}. Leave
        it empty for OpenRouter’s default routing. Measured-good defaults:
        fireworks, baseten.
      </p>
      {isDirty ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={mutating || error !== null}
            onClick={() =>
              setConfig.mutate({ key: entry.key, value: normalizeCsv(value) })
            }
          >
            Save
          </Button>
          <Button
            variant="ghost"
            disabled={mutating}
            onClick={() => setDraft(null)}
          >
            Discard
          </Button>
        </div>
      ) : null}
    </ConfigSection>
  );
}
