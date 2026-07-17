import { useSystemProviders } from '@knowtis/data-access-admin';
import { ErrorState, LoadingState } from '@knowtis/design-system';

import { ConfigSection } from './ConfigSection';
import { ProviderCard } from './ProviderCard';

export function ProvidersSection() {
  const providers = useSystemProviders();

  return (
    <ConfigSection
      title="Providers"
      description="Store a key to route without a redeploy — it overrides the environment. Disabling one takes it out of routing entirely."
    >
      {providers.isError ? (
        <ErrorState
          message="Could not load providers."
          onRetry={() => void providers.refetch()}
          fullHeight={false}
        />
      ) : providers.isLoading || !providers.data ? (
        <LoadingState />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {providers.data.map((provider) => (
            <ProviderCard key={provider.provider} provider={provider} />
          ))}
        </div>
      )}
    </ConfigSection>
  );
}
