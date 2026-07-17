import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';
import { useSettingsStore } from '@/stores/settings.store';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { Button, ModelSelect } from '@knowtis/design-system';
import { FEATURE_FLAG_KEYS, MODEL_TIERS } from '@knowtis/shared-types';

import { SectionHeader } from '../SectionHeader';
import { AIKeysManager } from './AIKeysManager';

export function AIAssistantSection() {
  const { t } = useTranslation('common');
  const { data: models, isPending, isError, refetch } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const { mutate: update } = useUpdateAISettings();
  const byokEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AGENT_BYOK);
  const openSettings = useSettingsStore((s) => s.open);

  const status = isError ? 'error' : isPending ? 'loading' : 'ready';

  const options = (models ?? []).map((m) => ({
    ...m,
    locked: m.access === 'requires_byok',
  }));
  const hasLocked = options.some((m) => m.locked);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader
          title={t('aiAssistant.copilotTitle')}
          description={t('aiAssistant.copilotDescription')}
        />
        <ModelSelect
          models={options}
          value={prefs?.preferredModel ?? null}
          onSelect={(id) => update({ preferredModel: id })}
          tierOrder={MODEL_TIERS}
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
          lockedBadgeLabel={t('aiAssistant.byok.lockedBadge')}
          footer={
            hasLocked ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto whitespace-normal p-0 text-left text-xs font-normal"
                onClick={() => openSettings('aiAssistant')}
              >
                {t('aiAssistant.byok.unlockCta')}
              </Button>
            ) : undefined
          }
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
