import { useEffect, useState } from 'react';

import {
  useClearSystemProviderKey,
  useSetSystemProvider,
  useTestSystemProvider,
  type SystemProvider,
} from '@knowtis/data-access-admin';
import {
  Badge,
  Button,
  Card,
  LoadingButton,
  MutationErrorAlert,
  PasswordInput,
  Switch,
} from '@knowtis/design-system';
import type { AIProvider } from '@knowtis/shared-types';

const PROVIDER_LABEL: Record<AIProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter',
};

const KEY_SOURCE_HINT: Record<SystemProvider['keySource'], string> = {
  database: 'Routing uses the key stored here.',
  environment:
    'Routing uses the key from the environment. Store one here to override it.',
  none: 'No key anywhere — this provider cannot route.',
};

interface ProviderCardProps {
  provider: SystemProvider;
}

export function ProviderCard({ provider }: ProviderCardProps) {
  const setProvider = useSetSystemProvider();
  const clearKey = useClearSystemProviderKey();
  const testProvider = useTestSystemProvider();
  const [draft, setDraft] = useState('');

  const label = PROVIDER_LABEL[provider.provider];
  const isBusy =
    setProvider.isPending || clearKey.isPending || testProvider.isPending;
  const saveProbe = setProvider.data?.probe;
  const saveProbeError = (saveProbe?.error ?? 'unknown error').replace(
    /\.+$/,
    ''
  );

  // A probe describes the key that was routing when it ran; once the row moves,
  // the verdict is about a key that is no longer there.
  const { reset: resetProbe } = testProvider;
  // A refetch re-parses into a fresh Date, so compare the instant, not the object.
  const writtenAt = provider.updatedAt?.getTime() ?? null;
  useEffect(() => {
    resetProbe();
  }, [
    resetProbe,
    provider.keySource,
    provider.enabled,
    provider.keyPrefix,
    writtenAt,
  ]);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{label}</span>
          <span className="font-mono text-xs text-(--muted-foreground)">
            {provider.provider}
          </span>
        </div>
        <Switch
          checked={provider.enabled}
          aria-label={`${label} enabled`}
          disabled={isBusy}
          onCheckedChange={(enabled) =>
            setProvider.mutate({ provider: provider.provider, enabled })
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={provider.keySource === 'none' ? 'outline' : 'default'}>
          {provider.keySource}
        </Badge>
        {provider.keyPrefix ? (
          <span className="font-mono text-xs text-(--muted-foreground)">
            {provider.keyPrefix}…
          </span>
        ) : null}
      </div>
      <p className="text-xs text-(--muted-foreground)">
        {provider.enabled
          ? KEY_SOURCE_HINT[provider.keySource]
          : 'Disabled — out of routing whatever its key says.'}
      </p>

      {provider.storedKeyUnreadable ? (
        <p
          role="alert"
          className="rounded-md bg-(--destructive)/10 p-2 text-xs text-(--destructive)"
        >
          The stored key cannot be decrypted, so it is being ignored. Replace it
          or clear it.
        </p>
      ) : null}

      <MutationErrorAlert
        error={setProvider.error ?? clearKey.error ?? testProvider.error}
        isError={
          setProvider.isError || clearKey.isError || testProvider.isError
        }
        fallbackMessage={`Could not update ${label}.`}
      />

      {saveProbe ? (
        saveProbe.valid ? (
          <p role="status" className="text-xs text-(--muted-foreground)">
            Key saved — {label} answered the probe.
          </p>
        ) : (
          <p
            role="alert"
            className="rounded-md bg-(--destructive)/10 p-2 text-xs text-(--destructive)"
          >
            Key saved, but {label} could not be reached to verify it:{' '}
            {saveProbeError}. Test it again once {label} is back.
          </p>
        )
      ) : null}

      {testProvider.data?.ok ? (
        <p role="status" className="text-xs text-(--muted-foreground)">
          {label} answered via {testProvider.data.model}.
        </p>
      ) : testProvider.data ? (
        <p
          role="alert"
          className="rounded-md bg-(--destructive)/10 p-2 text-xs text-(--destructive)"
        >
          {testProvider.data.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <PasswordInput
          value={draft}
          aria-label={`${label} API key`}
          placeholder={`New ${label} API key`}
          disabled={isBusy}
          onChange={(event) => setDraft(event.target.value)}
        />
        <LoadingButton
          loading={setProvider.isPending}
          loadingText="Verifying…"
          disabled={draft.trim().length === 0 || isBusy}
          onClick={() =>
            setProvider.mutate(
              { provider: provider.provider, apiKey: draft.trim() },
              { onSuccess: () => setDraft('') }
            )
          }
        >
          Save key
        </LoadingButton>
      </div>

      <div className="flex flex-wrap gap-2">
        <LoadingButton
          variant="outline"
          size="sm"
          loading={testProvider.isPending}
          loadingText="Testing…"
          disabled={isBusy}
          onClick={() => testProvider.mutate(provider.provider)}
        >
          Test connection
        </LoadingButton>
        {provider.keySource === 'database' || provider.storedKeyUnreadable ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onClick={() => clearKey.mutate(provider.provider)}
          >
            Clear stored key
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
