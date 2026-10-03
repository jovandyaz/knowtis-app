import { useTranslation } from 'react-i18next';

import { quotaStateOf, useAiQuota } from '@/hooks/useAiQuota';
import { useAISettings } from '@/hooks/useAISettings';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import { effectivePrimaryProvider } from '@/lib/ai/byok-providers';
import { PROVIDER_LABEL } from '@/lib/ai/provider-labels';
import { clockTimeOf } from '@/lib/format-date';

import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

interface BadgeContent {
  text: string;
  label: string;
  tooltip: string;
  warning: boolean;
}

export function TierBadge() {
  const { t, i18n } = useTranslation('notes');
  const quota = quotaStateOf(useAiQuota().data);
  const byok = quota.kind === 'unmetered';
  const preferences = useAISettings(byok);
  const keys = useProviderKeys(byok);

  let content: BadgeContent | null = null;
  if (quota.kind === 'metered') {
    const { used, limit } = quota;
    const tier = t(`ai.copilot.quota.tier.${quota.tier}`);
    content = {
      text: t('ai.copilot.quota.badge.metered', { tier, used, limit }),
      label: t('ai.copilot.quota.usedLabel', { tier, used, count: limit }),
      tooltip: t('ai.copilot.quota.resetsAt', {
        ...clockTimeOf(quota.resetsAt, i18n.language),
      }),
      warning: quota.low,
    };
  } else if (byok && !preferences.isPending && !keys.isPending) {
    const provider = effectivePrimaryProvider(
      preferences.data,
      keys.data ?? []
    );
    if (provider) {
      const name = PROVIDER_LABEL[provider];
      content = {
        text: t('ai.copilot.quota.badge.byok', { provider: name }),
        label: t('ai.copilot.quota.byokLabel', { provider: name }),
        tooltip: t('ai.copilot.quota.paysWithKey', { provider: name }),
        warning: false,
      };
    }
  }

  if (!content) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          role="img"
          tabIndex={0}
          aria-label={content.label}
          variant={content.warning ? 'warning' : 'outline'}
          className="min-w-0 max-w-[40%]"
        >
          <span className="truncate">{content.text}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{content.tooltip}</TooltipContent>
    </Tooltip>
  );
}
