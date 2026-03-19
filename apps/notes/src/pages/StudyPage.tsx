import { useTranslation } from 'react-i18next';

import { GraduationCap } from 'lucide-react';

import { useDueCards } from '@knowtis/data-access-artifacts';
import { EmptyState, LoadingState } from '@knowtis/design-system';

export function StudyPage() {
  const { t } = useTranslation('notes');
  const { data: dueCards, isLoading } = useDueCards();

  if (isLoading) {
    return <LoadingState message={t('ai.artifacts.loadingStudy')} />;
  }

  if (!dueCards || dueCards.length === 0) {
    return (
      <div className="mx-auto max-w-2xl pt-12">
        <EmptyState
          icon={<GraduationCap className="h-8 w-8 text-(--muted-foreground)" />}
          title={t('ai.artifacts.noCardsTitle')}
          description={t('ai.artifacts.noCardsDesc')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">
        {t('ai.artifacts.studySession')}
      </h1>
      <p className="text-muted-foreground mb-8">
        {t('ai.artifacts.cardsDue', { count: dueCards.length })}
      </p>
      {/* TODO: Integrate FlashcardStudy component for due cards */}
      <div className="space-y-3">
        {dueCards.map((card) => (
          <div
            key={`${card.artifactId}-${card.cardIndex}`}
            className="p-4 border border-border rounded-lg"
          >
            <p className="font-medium">{card.artifactTitle}</p>
            <p className="text-sm text-muted-foreground">
              {t('ai.artifacts.flashcards.cardOf', {
                current: card.cardIndex + 1,
                total: '?',
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
