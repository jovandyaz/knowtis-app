import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';
import { useAgentStore } from '@/stores/agent.store';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { DEFAULT_MODEL_INTENT, FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { advancedOverride } from '../../copilot/intent-picker-options';
import { IntentModelPicker } from '../../copilot/IntentModelPicker';
import { SectionHeader } from '../SectionHeader';
import { AIKeysManager } from './AIKeysManager';

export function AIAssistantSection() {
  const { t } = useTranslation('common');
  const { data: models, isError, refetch } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const { mutate: update } = useUpdateAISettings();
  const setSessionModel = useAgentStore((s) => s.setSelectedModel);
  const byokEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AGENT_BYOK);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader
          title={t('aiAssistant.intentTitle')}
          description={t('aiAssistant.intentDescription')}
        />
        <IntentModelPicker
          models={models}
          isError={isError}
          onRetry={() => void refetch()}
          intent={prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT}
          overrideModel={advancedOverride(prefs?.preferredModel, models)}
          onSelectIntent={(value) => {
            // The composer's session model outranks account preferences, so a
            // choice made here is inert until that override is dropped.
            setSessionModel(null);
            update({ preferredModel: null, preferredIntent: value });
          }}
          onSelectModel={(id) => {
            setSessionModel(null);
            update({ preferredModel: id });
          }}
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
