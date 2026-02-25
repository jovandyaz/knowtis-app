import { useTranslation } from 'react-i18next';

import { Search, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

import { EmptyState as DSEmptyState } from '@knowtis/design-system';

import { CreateNoteDialog } from './CreateNoteDialog';

interface EmptyStateProps {
  hasSearch: boolean;
}

export function EmptyState({ hasSearch }: EmptyStateProps) {
  const { t } = useTranslation('notes');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <DSEmptyState
        icon={
          hasSearch ? (
            <Search className="h-8 w-8 text-(--muted-foreground)/50" />
          ) : (
            <Sparkles className="h-8 w-8 text-(--primary)/50" />
          )
        }
        title={hasSearch ? t('list.noNotesFound') : t('list.startCollection')}
        description={
          hasSearch ? t('list.noSearchResults') : t('list.createFirst')
        }
        fullHeight={false}
        className="rounded-2xl border border-dashed border-(--border) bg-(--card)/30 py-12"
      >
        {!hasSearch && (
          <div className="mt-2">
            <CreateNoteDialog />
          </div>
        )}
      </DSEmptyState>
    </motion.div>
  );
}
