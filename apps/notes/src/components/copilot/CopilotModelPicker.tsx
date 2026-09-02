import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

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

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import {
  Button,
  ModelMenu,
  type ModelMenuEffort,
} from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';
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

/** Below this width a side flyout cannot sit beside the menu, so its sections render inline. */
const FLYOUT_MIN_WIDTH_QUERY = '(min-width: 768px)';

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
  const canFlyOut = useMediaQuery(FLYOUT_MIN_WIDTH_QUERY);
  const effortValue = useAgentStore((s) => s.reasoningEffort);
  const setReasoningEffort = useAgentStore((s) => s.setReasoningEffort);

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
  // Holding a key is not enough: the server only bills the turn to the user
  // when the key covers the resolved model's provider, so a mismatched key
  // must not unlock the effort ladder.
  const hasByok = canUseByok && selectedModel?.billedToUser === true;
  const effortOpts = effortOptions(selectedModel, t);
  // The conversation effort outlives a model change. A level the newly
  // resolved model never declared, or one no longer billed to the user, must
  // not ride the next turn, so it collapses to auto once the list has resolved.
  const effortStale =
    models !== undefined &&
    effortValue !== 'auto' &&
    !(hasByok && effortOpts.some((o) => o.id === effortValue));
  useEffect(() => {
    if (effortStale) {
      setReasoningEffort('auto');
    }
  }, [effortStale, setReasoningEffort]);
  const activeEffort = effortStale ? 'auto' : effortValue;

  if (!showPicker) {
    return null;
  }

  const offerBridge =
    canUseByok && !isPending && !keysPending && keys?.length === 0;
  const triggerLabel =
    selectedModel?.label ?? t(`aiAssistant.intent.${intent}` as never);
  const effortLabel = effortOpts.find((o) => o.id === activeEffort)?.label;
  const triggerDetail =
    hasByok && activeEffort !== 'auto' ? effortLabel : undefined;

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
              value: activeEffort,
              options: effortOpts,
              footnote: t('aiAssistant.menu.effortFootnote'),
              onChange: (id: string) =>
                setReasoningEffort(isReasoningEffort(id) ? id : 'auto'),
            }
          : undefined;

  // Anonymous: the row serving the running default renders checked and inert;
  // the settings endpoints reject a guest, so no selection may ever mutate.
  const anonymousValue = primary.find((row) => !row.locked)?.id ?? null;
  const menuValue = isAnonymous ? anonymousValue : (override ?? intent);

  const select = (id: string) => {
    if (isAnonymous) {
      return;
    }
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
        value={menuValue}
        onSelect={select}
        {...(effort && { effort })}
        {...(groups.length > 0 && {
          moreModels: { label: t('aiAssistant.menu.moreModels'), groups },
        })}
        {...(footerCta && { footerCta })}
        lockedHint={t('aiAssistant.menu.lockedHint')}
        inlineSections={!canFlyOut}
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
