import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { z } from 'zod';

import { LoadingState } from '@knowtis/design-system';
import {
  BUCKET_FILTERS,
  NOTE_LIST_VIEWS,
  TAG_PATH_MAX_LENGTH,
} from '@knowtis/shared-types';

const HomePage = lazy(() =>
  import('@/pages/HomePage').then((m) => ({ default: m.HomePage }))
);

export const notesSearchSchema = z.object({
  bucket: z.enum(BUCKET_FILTERS).optional().catch(undefined),
  // .default keeps `view` optional in the schema's input type, so links to
  // /notes are not forced to carry search params; .catch covers junk values.
  view: z.enum(NOTE_LIST_VIEWS).catch('all').default('all'),
  tag: z.string().max(TAG_PATH_MAX_LENGTH).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/notes/')({
  validateSearch: notesSearchSchema,
  component: NotesListWrapper,
});

function NotesListWrapper() {
  return (
    <Suspense fallback={<LoadingState message="" />}>
      <HomePage />
    </Suspense>
  );
}
