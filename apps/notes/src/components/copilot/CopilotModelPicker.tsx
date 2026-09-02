import { useTranslation } from 'react-i18next';

import { ROUTES } from '@/config';
import {
  useAISettings,
  useAvailableModels,
  useProviderKeys,
  useUpdateAISettings,
} from '@/hooks';
import { useAgentStore } from '@/stores/agent.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { useNavigate } from '@tanstack/react-router';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import {
  Button,
  ModelMenu,
  type ModelMenuEffort,
} from '@knowtis/design-system';
import {
  DEFAULT_MODEL_INTENT,
  FEATURE_FLAG_KEYS,
  isModelIntent,
  isReasoningEffort,
} from '@knowtis/shared-types';

import {
  effortOptions,
  moreModelGroups,
  primaryRows,
} from './intent-picker-options';

export function CopilotModelPicker() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const user = useAuthUser();
  const showPicker = user != null;
  const isAnonymous = user?.isAnonymous === true;
  // The key endpoints reject a guest, so BYOK stays registered-only.
  const canUseByok =
    useFeatureFlag(FEATURE_FLAG_KEYS.AGENT_BYOK) && !isAnonymous;
  const {
    data: models,
    isPending,
    isError,
    refetch,
  } = useAvailableModels(showPicker);
  const { data: prefs } = useAISettings(showPicker);
  const { mutate: update } = useUpdateAISettings();
  const openSettings = useSettingsStore((s) => s.open);
  const { data: keys, isPending: keysPending } = useProviderKeys(
    showPicker && canUseByok
  );
  const effortValue = useAgentStore((s) => s.reasoningEffort);
  const setReasoningEffort = useAgentStore((s) => s.setReasoningEffort);

  if (!showPicker) {
    return null;
  }

  const hasByok = canUseByok && (keys?.length ?? 0) > 0;
  const offerBridge =
    canUseByok && !isPending && !keysPending && keys?.length === 0;

  const intent = prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT;
  const primary = primaryRows(models, t);
  const groups = moreModelGroups(models, t);
  const moreRows = groups.flatMap((group) => group.options);
  const preferredModel = prefs?.preferredModel ?? null;
  const override =
    preferredModel !== null && moreRows.some((row) => row.id === preferredModel)
      ? preferredModel
      : null;

  const selectedModel = models?.find((m) =>
    override !== null ? m.id === override : m.servesIntent === intent
  );
  const triggerLabel =
    selectedModel?.label ?? t(`aiAssistant.intent.${intent}` as never);

  const effortOpts = effortOptions(selectedModel, t);
  const effortLabel = effortOpts.find((o) => o.id === effortValue)?.label;
  const triggerDetail =
    hasByok && effortValue !== 'auto' ? effortLabel : undefined;

  // Only a model that declares reasoning levels earns the row: anonymous gets
  // an inert locked upsell, a keyless registered user gets no control at all
  // because their turns never carry an effort.
  const effort: ModelMenuEffort | undefined =
    effortOpts.length === 0
      ? undefined
      : isAnonymous
        ? {
            label: t('aiAssistant.menu.effort'),
            value: 'auto',
            options: [],
            locked: true,
            onChange: () => undefined,
          }
        : hasByok
          ? {
              label: t('aiAssistant.menu.effort'),
              value: effortValue,
              options: effortOpts,
              footnote: t('aiAssistant.menu.effortFootnote'),
              onChange: (id: string) =>
                setReasoningEffort(isReasoningEffort(id) ? id : 'auto'),
            }
          : undefined;

  const select = (id: string) => {
    // A catalog model whose id collides with an intent must stay a model.
    if (moreRows.some((row) => row.id === id) || !isModelIntent(id)) {
      update({ preferredModel: id });
      return;
    }
    update({ preferredModel: null, preferredIntent: id });
  };

  const footerCta = isAnonymous
    ? {
        label: t('aiAssistant.menu.registerCta'),
        onClick: () => {
          void navigate({ to: ROUTES.REGISTER });
        },
      }
    : undefined;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <ModelMenu
        aria-label={t('aiAssistant.menu.triggerLabel')}
        primary={primary}
        value={isAnonymous ? null : (override ?? intent)}
        onSelect={select}
        {...(effort && { effort })}
        {...(groups.length > 0 && {
          moreModels: { label: t('aiAssistant.menu.moreModels'), groups },
        })}
        {...(footerCta && { footerCta })}
        triggerLabel={triggerLabel}
        {...(triggerDetail !== undefined && { triggerDetail })}
        status={isError ? 'error' : isPending ? 'loading' : 'ready'}
        onRetry={() => void refetch()}
        loadingLabel={t('aiAssistant.loading')}
        errorLabel={t('aiAssistant.loadError')}
        retryLabel={t('aiAssistant.retry')}
        triggerClassName="h-8"
      />
      {offerBridge ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-(--muted-foreground)"
          title={t('aiAssistant.byok.bridgeHint')}
          onClick={() => openSettings('aiAssistant', 'aiKeys')}
        >
          {t('aiAssistant.byok.bridge')}
        </Button>
      ) : null}
    </div>
  );
}
