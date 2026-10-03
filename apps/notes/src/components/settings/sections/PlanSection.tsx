import { useTranslation } from 'react-i18next';

import { useAiQuota } from '@/hooks/useAiQuota';

import { Badge, cn } from '@knowtis/design-system';
import { AI_ACCESS_TIERS, type AccessTier } from '@knowtis/shared-types';

import { TierBadge } from '../../copilot/TierBadge';
import { SectionHeader } from '../SectionHeader';

const PAYER = {
  anonymous: 'platform',
  free: 'platform',
  byok: 'key',
} as const satisfies Record<AccessTier, 'platform' | 'key'>;

export function PlanSection() {
  const { t } = useTranslation('common');
  const { t: tNotes } = useTranslation('notes');
  const currentTier = useAiQuota().data?.tier;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t('settings.sections.plan')}
        description={t('settings.descriptions.plan')}
      />
      <ul className="space-y-3">
        {AI_ACCESS_TIERS.map((tier) => {
          const current = tier === currentTier;
          return (
            <li
              key={tier}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'space-y-1 rounded-lg border p-4',
                current ? 'border-(--primary)' : 'border-(--border)'
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium text-(--foreground)">
                  {tNotes(`ai.copilot.quota.tier.${tier}`)}
                </h4>
                {current ? (
                  <>
                    <Badge variant="secondary">
                      {tNotes('ai.plan.current')}
                    </Badge>
                    <TierBadge />
                  </>
                ) : null}
              </div>
              <p className="text-sm text-(--muted-foreground)">
                {tNotes(`ai.plan.includes.${tier}`)}
              </p>
              <p className="text-sm text-(--foreground)">
                {tNotes(`ai.plan.pays.${PAYER[tier]}`)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
