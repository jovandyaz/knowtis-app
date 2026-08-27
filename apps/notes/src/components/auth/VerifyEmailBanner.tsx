import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { useAuthUser, useProfile } from '@jovandyaz/auth-react';
import { MailWarning, X } from 'lucide-react';

import { Button } from '@knowtis/design-system';

const DISMISSED_KEY = 'verify-email-banner-dismissed';
const DISMISSED_VALUE = 'true';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === DISMISSED_VALUE;
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, DISMISSED_VALUE);
  } catch {
    return;
  }
}

/**
 * Mounts the profile query itself, because nothing else in this app does.
 */
function UnverifiedEmailBanner() {
  const { t } = useTranslation('auth');
  const { data: profile } = useProfile();
  const openVerifyDialog = useVerifyEmailStore((s) => s.open);
  const [dismissed, setDismissed] = useState(readDismissed);

  // Tri-state: `undefined` is "no profile has resolved yet", not "unverified".
  // A `!emailVerifiedAt` test here would flash the banner at a verified user
  // on every boot.
  const unverified = profile?.emailVerifiedAt === null;

  if (!unverified || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    rememberDismissed();
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className="mx-4 mt-3 flex shrink-0 flex-col gap-3 rounded-lg border border-(--border) bg-(--primary)/5 p-3 md:mx-8 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-(--primary)" />
        <p className="text-sm text-(--foreground)">
          {t('verifyEmail.bannerText')}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button size="sm" onClick={openVerifyDialog}>
          {t('verifyEmail.bannerCta')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          aria-label={t('verifyEmail.bannerDismiss')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * The only in-app route to verification for an already-registered user.
 * An anonymous visitor has no address to verify, so they are turned away
 * before the profile query this banner depends on is ever mounted.
 */
export function VerifyEmailBanner() {
  const isAnonymous = useAuthUser()?.isAnonymous ?? false;

  if (isAnonymous) {
    return null;
  }

  return <UnverifiedEmailBanner />;
}
