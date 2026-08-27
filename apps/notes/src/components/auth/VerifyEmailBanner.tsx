import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { useAuthUser, useProfile } from '@jovandyaz/auth-react';
import { MailWarning, X } from 'lucide-react';

import { Button } from '@knowtis/design-system';

const DISMISSED_KEY = 'verify-email-banner-dismissed';

// `sessionStorage` outlives the logout reload that clears everything else, so a
// bare "dismissed" flag would hide the banner from the next account to sign in
// on this tab. Remembering *who* dismissed it keeps the answer per identity.
function readDismissedUserId(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(userId: string): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, userId);
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
  const [dismissedUserId, setDismissedUserId] = useState(readDismissedUserId);

  // Tri-state: `undefined` is "no profile has resolved yet", not "unverified".
  // A `!emailVerifiedAt` test here would flash the banner at a verified user
  // on every boot.
  if (profile?.emailVerifiedAt !== null || dismissedUserId === profile.id) {
    return null;
  }

  const handleDismiss = () => {
    rememberDismissed(profile.id);
    setDismissedUserId(profile.id);
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
