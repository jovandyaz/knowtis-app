import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { LoadingState } from '@knowtis/design-system';

const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);

export const Route = createFileRoute('/_authenticated/profile')({
  component: ProfilePageWrapper,
});

function ProfilePageWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" />}>
      <ProfilePage />
    </Suspense>
  );
}
