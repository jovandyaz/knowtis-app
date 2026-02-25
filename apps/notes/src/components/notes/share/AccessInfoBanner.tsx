import { useTranslation } from 'react-i18next';

import { Lock } from 'lucide-react';

interface AccessInfoBannerProps {
  canShare: boolean;
}

export function AccessInfoBanner({ canShare }: AccessInfoBannerProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="rounded-lg bg-muted/50 border border-border p-3">
      <div className="flex items-start gap-2">
        <Lock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {canShare ? t('share.canShare') : t('share.limitedAccess')}
          </p>
          <p className="text-xs text-muted-foreground">
            {canShare
              ? t('share.editorsCanShareDesc')
              : t('share.onlyOwnerCanShare')}
          </p>
        </div>
      </div>
    </div>
  );
}
