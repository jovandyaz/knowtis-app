import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { ModelSelect } from '@knowtis/design-system';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { SectionHeader } from '../SectionHeader';
import { AIKeysManager } from './AIKeysManager';

export function AIAssistantSection() {
  const { t } = useTranslation('common');
  const { data: models, isPending, isError, refetch } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const { mutate: update } = useUpdateAISettings();
  const byokEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AGENT_BYOK);

  const status = isError ? 'error' : isPending ? 'loading' : 'ready';

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader
          title={t('aiAssistant.copilotTitle')}
          description={t('aiAssistant.copilotDescription')}
        />
        <ModelSelect
          models={models ?? []}
          value={prefs?.preferredModel ?? null}
          onSelect={(id) => update({ preferredModel: id })}
          status={status}
          onRetry={() => refetch()}
          tierLabel={(tier) => t(`aiAssistant.tier.${tier}` as never)}
          renderDescription={(m) => t((m.descriptionKey ?? '') as never)}
          triggerLabel={t('aiAssistant.defaultHint')}
          loadingLabel={t('aiAssistant.loadingModels')}
          errorLabel={t('aiAssistant.loadError')}
          emptyLabel={t('aiAssistant.noModels')}
          retryLabel={t('aiAssistant.retry')}
          billedBadgeLabel={t('aiAssistant.byok.billedBadge')}
        />
      </section>

      <section className="space-y-1 opacity-60">
        <SectionHeader
          title={t('aiAssistant.editorTitle')}
          description={t('aiAssistant.editorComingSoon')}
        />
      </section>

      {byokEnabled ? <AIKeysManager /> : null}
    </div>
  );
}
