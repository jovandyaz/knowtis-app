import { useTranslation } from 'react-i18next';

import { NoteList } from '@/components/notes';

export function HomePage() {
  const { t } = useTranslation(['notes', 'common']);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-[28px] md:text-3xl font-bold tracking-tight text-(--foreground)">
          {t('notes:sidebar.myNotes')}
        </h1>
        <p className="mt-2 text-(--muted-foreground)/70">
          {t('common:welcome.notesDescription')}
        </p>
      </div>

      <NoteList />
    </div>
  );
}
