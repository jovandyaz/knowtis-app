import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { ROUTES } from '@/config/routes.config';
import { aiQuotaQueryKeys, type QuotaState } from '@/hooks/useAiQuota';
import { captureProductEvent } from '@/lib/analytics/product-events';
import { formatTime } from '@/lib/format-date';
import { useSettingsStore } from '@/stores/settings.store';

import { Button } from '@knowtis/design-system';

const RESET_RECHECK_FLOOR_MS = 5_000;

function msUntilRecheck(resetsAt: string): number {
  const untilReset = Date.parse(resetsAt) - Date.now();
  return untilReset > RESET_RECHECK_FLOOR_MS
    ? untilReset
    : RESET_RECHECK_FLOOR_MS;
}

export interface QuotaLock {
  tier: Extract<QuotaState, { kind: 'metered' }>['tier'];
  /** Null when only the refusal is known, not today's quota. */
  limit: number | null;
  resetsAt: string;
}

export function QuotaLockedNotice({ tier, limit, resetsAt }: QuotaLock) {
  const { t, i18n } = useTranslation('notes');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messageId = useId();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recheckAfterReset = () => {
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: aiQuotaQueryKeys.all });
        recheckAfterReset();
      }, msUntilRecheck(resetsAt));
    };
    recheckAfterReset();
    return () => clearTimeout(timer);
  }, [queryClient, resetsAt]);

  const time = formatTime(resetsAt, i18n.language);
  const guest = tier === 'anonymous';

  const upgrade = () => {
    captureProductEvent('ai upgrade cta clicked', {
      from_tier: tier,
      cta: guest ? 'register' : 'byok',
    });
    if (guest) {
      void navigate({ to: ROUTES.REGISTER });
      return;
    }
    useSettingsStore.getState().open('aiAssistant', 'aiKeys');
  };

  return (
    <div className="flex flex-col items-stretch gap-2 px-1 py-0.5 sm:items-start">
      <p id={messageId} role="status" className="text-sm text-foreground">
        {limit === null
          ? t('ai.copilot.quota.exhaustedToday', { time })
          : t('ai.copilot.quota.exhausted', { count: limit, time })}
      </p>
      <Button
        type="button"
        size="sm"
        aria-describedby={messageId}
        onClick={upgrade}
      >
        {t(guest ? 'ai.copilot.quota.registerCta' : 'ai.copilot.quota.byokCta')}
      </Button>
    </div>
  );
}
