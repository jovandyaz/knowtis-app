import { useTranslation } from 'react-i18next';

import { createFileRoute, redirect } from '@tanstack/react-router';

import { authStore } from '@/auth';
import { ConsentCard } from '@/components/oauth/ConsentCard';
import { ROUTES } from '@/config';
import { z } from 'zod';

import {
  useConsentDecision,
  useOauthInteraction,
} from '@knowtis/data-access-oauth';
import { ErrorState, LoadingState } from '@knowtis/design-system';

const consentSearchSchema = z.object({
  uid: z.string().catch(''),
});

export const Route = createFileRoute('/_app/oauth/consent')({
  validateSearch: consentSearchSchema,
  beforeLoad: ({ location }) => {
    const { isAuthenticated, user } = authStore.getState();
    if (!isAuthenticated || user?.isAnonymous) {
      // location.href carries the ?uid= capability through login and back.
      throw redirect({ to: ROUTES.LOGIN, search: { redirect: location.href } });
    }
  },
  component: OauthConsentRoute,
});

function OauthConsentRoute() {
  const { t } = useTranslation('common');
  const { uid } = Route.useSearch();
  const interaction = useOauthInteraction(uid);
  const decision = useConsentDecision(uid);

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center p-4">
      {/* Referrer-Policy: the uid is a bearer capability — never leak it via Referer. */}
      <meta name="referrer" content="no-referrer" />

      {(!uid || interaction.isError) && (
        <ErrorState
          title={t('oauth.errorTitle')}
          message={t('oauth.errorDescription')}
        />
      )}

      {uid && !interaction.isError && interaction.isPending && (
        <LoadingState message={t('oauth.loading')} />
      )}

      {uid && interaction.isSuccess && (
        <ConsentCard
          details={interaction.data}
          onApprove={() =>
            decision.mutate({
              action: 'approve',
              approvedScopes: interaction.data.scopes,
            })
          }
          onDeny={() => decision.mutate({ action: 'deny' })}
          isApproving={
            decision.isPending && decision.variables?.action === 'approve'
          }
          isDenying={
            decision.isPending && decision.variables?.action === 'deny'
          }
        />
      )}
    </div>
  );
}
