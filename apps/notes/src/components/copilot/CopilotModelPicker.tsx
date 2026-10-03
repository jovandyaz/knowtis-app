import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useAISettings, useUpdateAISettings } from '@/hooks/useAISettings';
import { useAvailableModels } from '@/hooks/useAvailableModels';
import { captureProductEvent } from '@/lib/analytics/product-events';
import { useAgentStore } from '@/stores/agent.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthUser } from '@jovandyaz/auth-react';

import { ModelMenu, type ModelMenuEffort } from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';
import {
  DEFAULT_MODEL_INTENT,
  isModelIntent,
  isReasoningEffort,
  type AccessTier,
} from '@knowtis/shared-types';

import {
  advancedGroups,
  effortOptions,
  primaryRows,
  resolveSelectedModel,
} from './intent-picker-options';

/** Below this width a side flyout cannot sit beside the menu, so its sections render inline. */
const FLYOUT_MIN_WIDTH_QUERY = '(min-width: 768px)';
const FREE_TIER = 'free' satisfies AccessTier;
const BYOK_TIER = 'byok' satisfies AccessTier;

export function CopilotModelPicker() {
  const user = useAuthUser();
  if (user == null) {
    return null;
  }
  return user.isAnonymous === true ? (
    <GuestModelLabel />
  ) : (
    <AccountModelPicker />
  );
}

function GuestModelLabel() {
  const { t } = useTranslation('common');
  return (
    <span className="inline-flex h-8 items-center px-2 text-sm text-(--muted-foreground)">
      {t(`aiAssistant.intent.${DEFAULT_MODEL_INTENT}` as never)}
    </span>
  );
}

function AccountModelPicker() {
  const { t } = useTranslation('common');
  const { data: catalog, isPending, isError, refetch } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const { mutate: update } = useUpdateAISettings();
  const openSettings = useSettingsStore((s) => s.open);
  const canFlyOut = useMediaQuery(FLYOUT_MIN_WIDTH_QUERY);
  const effortValue = useAgentStore((s) => s.reasoningEffort);
  const setReasoningEffort = useAgentStore((s) => s.setReasoningEffort);

  const models = catalog?.models;
  const intent = prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT;
  const primary = primaryRows(models, t);
  const groups = catalog?.tier === BYOK_TIER ? advancedGroups(models, t) : [];
  const advancedIds = new Set(
    groups.flatMap((group) => group.options.map((option) => option.id))
  );
  const selectedModel = resolveSelectedModel(models, prefs);
  const override =
    selectedModel && !selectedModel.servesIntent ? selectedModel : undefined;
  const activeIntent = selectedModel?.servesIntent ?? intent;
  const isEmpty = models !== undefined && models.length === 0;
  const effortOpts = effortOptions(selectedModel, t);
  const effortStale =
    models !== undefined &&
    effortValue !== 'auto' &&
    !effortOpts.some((o) => o.id === effortValue);
  useEffect(() => {
    if (effortStale) {
      setReasoningEffort('auto');
    }
  }, [effortStale, setReasoningEffort]);
  const activeEffort = effortStale ? 'auto' : effortValue;

  const triggerLabel = isEmpty
    ? t('aiAssistant.empty')
    : (override?.label ?? t(`aiAssistant.intent.${activeIntent}` as never));
  const effortLabel = effortOpts.find((o) => o.id === activeEffort)?.label;
  const triggerDetail = activeEffort !== 'auto' ? effortLabel : undefined;

  const effort: ModelMenuEffort | undefined =
    effortOpts.length === 0
      ? undefined
      : {
          label: t('aiAssistant.menu.effort'),
          value: activeEffort,
          options: effortOpts,
          footnote: t(
            selectedModel?.billedToUser
              ? 'aiAssistant.menu.effortFootnote'
              : 'aiAssistant.menu.effortFootnoteFree'
          ),
          onChange: (id: string) =>
            setReasoningEffort(isReasoningEffort(id) ? id : 'auto'),
        };

  const select = (id: string) => {
    // A catalog model whose id collides with an intent must stay a model.
    if (advancedIds.has(id) || !isModelIntent(id)) {
      update({ preferredModel: id });
      return;
    }
    update({ preferredModel: null, preferredIntent: id });
  };

  const footerCta =
    catalog?.tier === FREE_TIER
      ? {
          label: t('aiAssistant.menu.byokCta'),
          onClick: () => {
            captureProductEvent('ai upgrade cta clicked', {
              from_tier: FREE_TIER,
              cta: 'more_models',
            });
            openSettings('aiAssistant', 'aiKeys');
          },
        }
      : undefined;

  return (
    <ModelMenu
      aria-label={t('aiAssistant.menu.triggerLabel')}
      primary={primary}
      value={override?.id ?? activeIntent}
      onSelect={select}
      {...(effort && { effort })}
      {...(groups.length > 0 && {
        moreModels: { label: t('aiAssistant.menu.advanced'), groups },
      })}
      {...(footerCta && { footerCta })}
      inlineSections={!canFlyOut}
      triggerLabel={triggerLabel}
      {...(triggerDetail !== undefined && { triggerDetail })}
      status={isError || isEmpty ? 'error' : isPending ? 'loading' : 'ready'}
      onRetry={() => void refetch()}
      loadingLabel={t('aiAssistant.loading')}
      errorLabel={t(isEmpty ? 'aiAssistant.empty' : 'aiAssistant.loadError')}
      retryLabel={t('aiAssistant.retry')}
      triggerClassName="h-8"
    />
  );
}
