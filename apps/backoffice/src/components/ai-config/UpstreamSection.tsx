import { useRef } from 'react';

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

import { ConfigSection } from './ConfigSection';
import { ConfigSourceCell } from './ConfigSourceCell';
import { useForkedDraft } from './useForkedDraft';

const OPENROUTER_PROVIDER_SLUG = /^[a-z0-9-]+(\/[a-z0-9.-]+)?$/;
const MAX_OPENROUTER_PROVIDERS = 8;
const UPSTREAM_COPY = {
  preference: {
    id: 'ai-openrouter-upstreams',
    title: 'OpenRouter upstreams',
    description:
      'Preferred upstream providers, tried in order. OpenRouter may fall back to other providers that are not excluded.',
    label: 'Preferred providers',
    helper:
      'Leave it empty for OpenRouter’s default routing. Measured-good defaults: fireworks, baseten.',
    placeholder: 'fireworks,baseten',
  },
  ignore: {
    id: 'ai-openrouter-ignored-upstreams',
    title: 'OpenRouter exclusions',
    description:
      'Excluded upstream providers are skipped on every OpenRouter attempt, including fallbacks. Direct providers are unaffected.',
    label: 'Ignored providers',
    helper:
      'Leave it empty to exclude no providers. Exclusions override preferences; requests can fail if no eligible upstream remains.',
    placeholder: 'parasail',
  },
} as const;

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
  mode: keyof typeof UPSTREAM_COPY;
}

export function UpstreamSection({ entry, mode }: UpstreamSectionProps) {
  const copy = UPSTREAM_COPY[mode];
  const setConfig = useSetAiConfig();
  const resetConfig = useResetAiConfig();
  const mutationInFlight = useRef(false);
  // Cross-guard: a PUT and a DELETE on the same key must not race.
  const mutating = setConfig.isPending || resetConfig.isPending;
  const { value, isDirty, edit, discard } = useForkedDraft(entry.value);
  const error = validate(value);

  const releaseMutation = () => {
    mutationInFlight.current = false;
  };

  const save = () => {
    if (mutationInFlight.current || mutating || error !== null) {
      return;
    }
    mutationInFlight.current = true;
    setConfig.mutate(
      { key: entry.key, value: normalizeCsv(value) },
      { onSuccess: discard, onSettled: releaseMutation }
    );
  };

  const reset = () => {
    if (mutationInFlight.current || mutating) {
      return;
    }
    mutationInFlight.current = true;
    resetConfig.mutate({ key: entry.key }, { onSettled: releaseMutation });
  };

  return (
    <ConfigSection title={copy.title} description={copy.description}>
      <MutationErrorAlert
        error={setConfig.error}
        isError={setConfig.isError}
        fallbackMessage={`Could not update ${copy.label.toLowerCase()}.`}
      />
      <ConfigSourceCell
        entry={entry}
        label={copy.label.toLowerCase()}
        disabled={mutating}
        onReset={reset}
      />
      <FormField id={copy.id} label={copy.label} error={error ?? undefined}>
        <Input
          id={copy.id}
          value={value}
          disabled={mutating}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={error !== null ? `${copy.id}-error` : undefined}
          placeholder={copy.placeholder}
          onChange={(event) => edit(event.target.value)}
        />
      </FormField>
      <p className="text-xs text-(--muted-foreground)">
        Comma-separated lowercase slugs, up to {MAX_OPENROUTER_PROVIDERS}.{' '}
        {copy.helper}
      </p>
      {isDirty ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={mutating || error !== null} onClick={save}>
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
