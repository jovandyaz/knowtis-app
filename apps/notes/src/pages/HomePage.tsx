import { useTranslation } from 'react-i18next';

import { NoteList } from '@/components/notes';

export function HomePage() {
  const { t } = useTranslation(['notes', 'common']);

  return (
    <div className="mx-auto max-w-5xl py-4 md:py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-(--foreground)">
          {t('notes:sidebar.myNotes')}
        </h1>
        <p className="mt-2 text-(--muted-foreground)">
          {t('common:welcome.notesDescription')}
        </p>
      </div>

      <NoteList />
    </div>
  );
}
