import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { AnonymousLimitModal } from '@/components/anonymous/AnonymousLimitModal';
import { useCreateAndNavigateToNote } from '@/hooks/useCreateAndNavigateToNote';

import { LoadingState } from '@knowtis/design-system';

export const Route = createFileRoute('/_app/notes/new')({
  component: NewNotePage,
});

function NewNotePage() {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const [showLimitModal, setShowLimitModal] = useState(false);
  const createAndNavigate = useCreateAndNavigateToNote();

  useEffect(() => {
    createAndNavigate({
      focusTarget: 'title',
      onLimitReached: () => setShowLimitModal(true),
    });
  }, [createAndNavigate]);

  return (
    <>
      <LoadingState message={t('create.buttonLoading')} />
      <AnonymousLimitModal
        open={showLimitModal}
        onClose={() => {
          setShowLimitModal(false);
          navigate({ to: '/', replace: true });
        }}
      />
    </>
  );
}
