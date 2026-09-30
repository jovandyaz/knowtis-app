import { useState, type ReactNode } from 'react';

import { AiConfigStatusHeader } from '@/components/ai-config/AiConfigStatusHeader';
import { CatalogSection } from '@/components/ai-config/CatalogSection';
import { MessageLimitsSection } from '@/components/ai-config/MessageLimitsSection';
import { ModelsSection } from '@/components/ai-config/ModelsSection';
import { ProvidersSection } from '@/components/ai-config/ProvidersSection';
import { ReasoningSection } from '@/components/ai-config/ReasoningSection';
import { RoutingSection } from '@/components/ai-config/RoutingSection';
import { UpstreamSection } from '@/components/ai-config/UpstreamSection';

import { useAiConfig } from '@knowtis/data-access-admin';
import { useFeatureFlags } from '@knowtis/data-access-feature-flags';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@knowtis/design-system';
import { AI_CONFIG_KEYS, FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

const AI_CONFIG_TABS = [
  { value: 'models', label: 'Models' },
  { value: 'providers', label: 'Providers' },
] as const;

type AiConfigTabValue = (typeof AI_CONFIG_TABS)[number]['value'];

const TAB: Record<AiConfigTabValue, AiConfigTabValue> = {
  models: 'models',
  providers: 'providers',
};

const MESSAGE_LIMIT_KEYS = [
  AI_CONFIG_KEYS.ANON_DAILY_MESSAGES,
  AI_CONFIG_KEYS.FREE_DAILY_MESSAGES,
] as const;

export function AiConfigPage() {
  const config = useAiConfig();
  const flags = useFeatureFlags();
  // Controlled so a section can send the admin to Providers (key configuration).
  const [tab, setTab] = useState<AiConfigTabValue>(TAB.models);

  const chain = config.data?.find((entry) => entry.kind === 'chain');
  const effort = config.data?.find((entry) => entry.kind === 'choice');
  const upstreams = config.data?.find(
    (entry) => entry.key === AI_CONFIG_KEYS.OPENROUTER_PROVIDERS
  );
  const ignoredUpstreams = config.data?.find(
    (entry) => entry.key === AI_CONFIG_KEYS.OPENROUTER_IGNORED_PROVIDERS
  );
  const modelEntries = (config.data ?? []).filter(
    (entry) => entry.kind === 'model'
  );
  const messageLimits = (config.data ?? []).filter((entry) =>
    (MESSAGE_LIMIT_KEYS as readonly string[]).includes(entry.key)
  );
  const defaultModel =
    config.data?.find((entry) => entry.key === AI_CONFIG_KEYS.DEFAULT_MODEL)
      ?.value ?? null;

  const aiEnabled =
    (flags.data ?? []).find((flag) => flag.key === FEATURE_FLAG_KEYS.AI_ENABLED)
      ?.enabled ?? false;
  const aiKnownDisabled = !!flags.data && !aiEnabled;

  const renderConfigPanel = (panel: ReactNode) => {
    if (config.isError) {
      return aiKnownDisabled ? (
        <EmptyState
          title="AI is disabled"
          description="Turn AI on with the toggle in the header above to load its configuration."
          fullHeight={false}
        />
      ) : (
        <ErrorState
          message="Could not load AI config."
          onRetry={() => void config.refetch()}
          fullHeight={false}
        />
      );
    }
    if (config.isLoading || !config.data) {
      return <LoadingState />;
    }
    return panel;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">AI Config</h1>
        <p className="text-sm text-(--muted-foreground)">
          Effective runtime configuration. Stored values override the code
          defaults and apply within a minute — no redeploy.
        </p>
      </div>
      <AiConfigStatusHeader defaultModel={defaultModel} />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as AiConfigTabValue)}
      >
        <TabsList>
          {AI_CONFIG_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={TAB.models} className="flex flex-col gap-8 pt-4">
          {renderConfigPanel(
            <>
              <ModelsSection
                entries={modelEntries}
                onConfigureProviders={() => setTab(TAB.providers)}
              />
              <div
                data-testid="ai-config-settings-grid"
                className="grid grid-cols-1 gap-8 xl:grid-cols-2"
              >
                {chain ? <RoutingSection entry={chain} /> : null}
                {effort ? <ReasoningSection entry={effort} /> : null}
                {messageLimits.length > 0 ? (
                  <MessageLimitsSection entries={messageLimits} />
                ) : null}
              </div>
            </>
          )}
          <CatalogSection />
        </TabsContent>
        <TabsContent value={TAB.providers} className="flex flex-col gap-8 pt-4">
          {renderConfigPanel(
            <>
              {upstreams ? (
                <UpstreamSection entry={upstreams} mode="preference" />
              ) : null}
              {ignoredUpstreams ? (
                <UpstreamSection entry={ignoredUpstreams} mode="ignore" />
              ) : null}
            </>
          )}
          <ProvidersSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
