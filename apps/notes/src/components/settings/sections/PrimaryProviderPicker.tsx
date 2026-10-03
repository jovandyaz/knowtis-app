import { useTranslation } from 'react-i18next';

import { useAISettings, useUpdateAISettings } from '@/hooks/useAISettings';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import {
  effectivePrimaryProvider,
  keysInAddedOrder,
} from '@/lib/ai/byok-providers';
import { PROVIDER_LABEL } from '@/lib/ai/provider-labels';

import { RadioCardGroup } from '@knowtis/design-system';

import { SectionHeader } from '../SectionHeader';

const MIN_KEYS_TO_CHOOSE = 2;

export function PrimaryProviderPicker() {
  const { t } = useTranslation('common');
  const { data: keys } = useProviderKeys(true);
  const { data: preferences } = useAISettings();
  const { mutate: update } = useUpdateAISettings();

  const held = keys ?? [];
  const primary = effectivePrimaryProvider(preferences, held);
  if (held.length < MIN_KEYS_TO_CHOOSE || primary === null) {
    return null;
  }

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t('aiAssistant.primaryProvider.title')}
        description={t('aiAssistant.primaryProvider.description')}
      />
      <RadioCardGroup
        aria-label={t('aiAssistant.primaryProvider.title')}
        options={keysInAddedOrder(held).map((key) => ({
          value: key.provider,
          title: PROVIDER_LABEL[key.provider],
          description: t('aiAssistant.byok.stored', { prefix: key.keyPrefix }),
        }))}
        value={primary}
        onValueChange={(provider) => update({ primaryProvider: provider })}
      />
    </section>
  );
}
