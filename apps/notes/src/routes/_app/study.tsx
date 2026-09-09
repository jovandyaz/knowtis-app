import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { createFileRoute } from '@tanstack/react-router';

import { LoadingState } from '@knowtis/design-system';

const StudySessionPage = lazy(() =>
  import('@/pages/StudySessionPage').then((m) => ({
    default: m.StudySessionPage,
  }))
);

export const Route = createFileRoute('/_app/study')({
  component: StudyPageWrapper,
});

function StudyPageWrapper() {
  const { t } = useTranslation('notes');

  return (
    <Suspense
      fallback={
        <LoadingState
          role="status"
          aria-label={t('study.loading')}
          message={t('study.loading')}
        />
      }
    >
      <StudySessionPage />
    </Suspense>
  );
}
