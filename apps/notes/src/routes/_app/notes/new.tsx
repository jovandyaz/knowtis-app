import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { AnonymousLimitModal } from '@/components/anonymous/AnonymousLimitModal';
import { useCreateNoteAction } from '@/hooks/useCreateNoteAction';

import { LoadingState } from '@knowtis/design-system';

export const Route = createFileRoute('/_app/notes/new')({
  component: NewNotePage,
});

function NewNotePage() {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const { createNote, showLimitModal, dismissLimitModal } =
    useCreateNoteAction();

  useEffect(() => {
    createNote();
  }, [createNote]);

  return (
    <>
      <LoadingState message={t('create.buttonLoading')} />
      <AnonymousLimitModal
        open={showLimitModal}
        onClose={() => {
          dismissLimitModal();
          navigate({ to: '/', replace: true });
        }}
      />
    </>
  );
}
