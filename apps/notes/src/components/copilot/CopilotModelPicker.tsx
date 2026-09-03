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
  resolveSelectedModel,
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
  const selectedModel = resolveSelectedModel(models, prefs);
  const override =
    selectedModel && !selectedModel.servesIntent ? selectedModel.id : null;
  const isEmpty = models !== undefined && models.length === 0;
  const billedToUser = selectedModel?.billedToUser === true;
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
  // The anonymous row is pinned to auto, so nothing may advertise a level for a guest.
  const activeEffort = isAnonymous || effortStale ? 'auto' : effortValue;

  if (!showPicker) {
    return null;
  }

  const offerBridge =
    canUseByok && !isPending && !keysPending && keys?.length === 0;
  const triggerLabel = isEmpty
    ? t('aiAssistant.empty')
    : (selectedModel?.label ?? t(`aiAssistant.intent.${intent}` as never));
  const effortLabel = effortOpts.find((o) => o.id === activeEffort)?.label;
  const triggerDetail = activeEffort !== 'auto' ? effortLabel : undefined;

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
        : {
            label: t('aiAssistant.menu.effort'),
            value: activeEffort,
            options: effortOpts,
            footnote: t(
              billedToUser
                ? 'aiAssistant.menu.effortFootnote'
                : 'aiAssistant.menu.effortFootnoteFree'
            ),
            onChange: (id: string) =>
              setReasoningEffort(isReasoningEffort(id) ? id : 'auto'),
          };

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
        status={isError || isEmpty ? 'error' : isPending ? 'loading' : 'ready'}
        onRetry={() => void refetch()}
        loadingLabel={t('aiAssistant.loading')}
        errorLabel={t(isEmpty ? 'aiAssistant.empty' : 'aiAssistant.loadError')}
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
