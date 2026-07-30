import { AiConfigStatusHeader } from '@/components/ai-config/AiConfigStatusHeader';
import { ModelsSection } from '@/components/ai-config/ModelsSection';
import { ProvidersSection } from '@/components/ai-config/ProvidersSection';
import { ReasoningSection } from '@/components/ai-config/ReasoningSection';
import { RoutingSection } from '@/components/ai-config/RoutingSection';
import { UpstreamSection } from '@/components/ai-config/UpstreamSection';
import { FlagGroupSection } from '@/components/flags/FlagGroupSection';

import { useAiConfig } from '@knowtis/data-access-admin';
import { useFeatureFlags } from '@knowtis/data-access-feature-flags';
import {
  ErrorState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@knowtis/design-system';
import {
  FLAG_DOMAIN,
  FLAG_GROUP,
  flagMetaFor,
  type FlagGroup,
} from '@knowtis/shared-types';

const AI_CONFIG_TABS = [
  { value: 'models', label: 'Models' },
  { value: 'guardrails', label: 'Guardrails & Limits' },
  { value: 'providers', label: 'Providers' },
  { value: 'capabilities', label: 'Capabilities & Access' },
] as const;

export function AiConfigPage() {
  const config = useAiConfig();
  const flags = useFeatureFlags();

  const chain = config.data?.find((entry) => entry.kind === 'chain');
  const effort = config.data?.find((entry) => entry.kind === 'choice');
  const upstreams = config.data?.find((entry) => entry.kind === 'list');
  const defaultModel =
    config.data?.find((entry) => entry.key === 'ai_default_model')?.value ??
    null;

  const aiFlagsIn = (group: FlagGroup) =>
    (flags.data ?? []).filter((flag) => {
      const meta = flagMetaFor(flag.key);
      return meta.domain === FLAG_DOMAIN.AI && meta.group === group;
    });

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
      <Tabs defaultValue="models">
        <TabsList>
          {AI_CONFIG_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="models" className="flex flex-col gap-8 pt-4">
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
        </TabsContent>
        <TabsContent value="guardrails" className="pt-4">
          <FlagGroupSection
            title="Guardrails & Limits"
            description="Safety and spend protections. Numeric limits are env-configured."
            flags={aiFlagsIn(FLAG_GROUP.GUARDRAIL)}
          />
        </TabsContent>
        <TabsContent value="providers" className="flex flex-col gap-8 pt-4">
          {upstreams ? <UpstreamSection entry={upstreams} /> : null}
          <ProvidersSection />
        </TabsContent>
        <TabsContent value="capabilities" className="flex flex-col gap-6 pt-4">
          <FlagGroupSection
            title="Capabilities"
            description="Optional agent features, some gated on an env key."
            flags={aiFlagsIn(FLAG_GROUP.CAPABILITY)}
          />
          <FlagGroupSection
            title="Access"
            description="Which users get which AI features."
            flags={aiFlagsIn(FLAG_GROUP.ACCESS)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
