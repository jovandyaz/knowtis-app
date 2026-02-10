import { EmptyState as DSEmptyState } from '@knowtis/design-system';
import { Search, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

import { CreateNoteDialog } from './CreateNoteDialog';

interface EmptyStateProps {
  hasSearch: boolean;
}

export function EmptyState({ hasSearch }: EmptyStateProps) {
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
        title={hasSearch ? 'No notes found' : 'Start your collection'}
        description={
          hasSearch
            ? "We couldn't find any notes matching your search. Try a different term."
            : 'Create your first note to get started capturing your ideas.'
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
