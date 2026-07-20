import { ModelsSection } from '@/components/ai-config/ModelsSection';
import { ProvidersSection } from '@/components/ai-config/ProvidersSection';
import { ReasoningSection } from '@/components/ai-config/ReasoningSection';
import { RoutingSection } from '@/components/ai-config/RoutingSection';

import { useAiConfig } from '@knowtis/data-access-admin';
import { ErrorState, LoadingState } from '@knowtis/design-system';

export function AiConfigPage() {
  const config = useAiConfig();
  const chain = config.data?.find((entry) => entry.kind === 'chain');
  const effort = config.data?.find((entry) => entry.kind === 'choice');

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">AI Config</h1>
        <p className="text-sm text-(--muted-foreground)">
          Effective runtime configuration. Stored values override the code
          defaults and apply within a minute — no redeploy.
        </p>
      </div>
      {config.isError ? (
        <ErrorState
          message="Could not load AI config."
          onRetry={() => void config.refetch()}
          fullHeight={false}
        />
      ) : config.isLoading || !config.data ? (
        <LoadingState />
      ) : (
        <>
          <ModelsSection
            entries={config.data.filter((entry) => entry.kind === 'model')}
          />
          {chain ? <RoutingSection entry={chain} /> : null}
          {effort ? <ReasoningSection entry={effort} /> : null}
        </>
      )}
      <ProvidersSection />
    </div>
  );
}
