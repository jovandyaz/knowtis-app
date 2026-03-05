import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { useAuthUser } from '@jovandyaz/auth-react';
import { X } from 'lucide-react';

export function UpgradeBanner() {
  const user = useAuthUser();
  const [dismissed, setDismissed] = useState(false);
  const { t } = useTranslation('common');

  if (!user?.isAnonymous || dismissed) {
    return null;
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-(--primary)/10 via-(--primary)/5 to-transparent border-b border-(--border) px-4 py-2.5">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <p className="text-sm text-(--muted-foreground)">
          {t('anonymous.banner.usingAsGuest')}{' '}
          {t('anonymous.banner.upgradeMessage')}
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            to="/register"
            className="text-sm font-medium text-(--primary) hover:underline"
          >
            {t('nav.createAccount')}
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-(--muted-foreground) hover:text-(--foreground) transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
