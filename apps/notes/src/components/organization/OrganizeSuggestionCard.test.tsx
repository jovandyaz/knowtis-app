import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TAG_MAX_PER_NOTE,
  type OrganizationSuggestion,
} from '@knowtis/shared-types';

import { OrganizeSuggestionCard } from './OrganizeSuggestionCard';

const updateNote = vi.fn();
const toastError = vi.fn();

vi.mock('@knowtis/data-access-notes', () => ({
  useUpdateNote: () => ({ mutate: updateNote, isPending: false }),
}));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const NOTE_ID = 'note-1';

const suggestion: OrganizationSuggestion = {
  noteId: NOTE_ID,
  bucket: 'projects',
  tags: [
    { path: 'work/alpha', isNew: false },
    { path: 'ai/agents', isNew: true },
  ],
  relatedNotes: [{ id: 'note-2', title: 'Kickoff Alpha' }],
};

async function renderCard(
  overrides: Partial<React.ComponentProps<typeof OrganizeSuggestionCard>> = {}
) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <OrganizeSuggestionCard
          suggestion={suggestion}
          currentBucket={null}
          currentTags={[]}
          onDismiss={vi.fn()}
          {...overrides}
        />
        <Outlet />
      </>
    ),
  });
  const noteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notes/$noteId',
    component: () => <p>note</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([noteRoute]),
    history: createMemoryHistory({ initialEntries: ['/notes/note-1'] }),
  });

  const result = render(<RouterProvider router={router} />);
  await screen.findByText('organization.suggestion.title');
  return result;
}

describe('OrganizeSuggestionCard', () => {
  beforeEach(() => {
    updateNote.mockClear();
    toastError.mockClear();
    updateNote.mockImplementation(() => undefined);
  });

  it('should apply the whole suggestion in a single note update', async () => {
    const user = userEvent.setup();
    await renderCard();

    await user.click(screen.getByText('organization.suggestion.apply'));

    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(updateNote.mock.calls[0][0]).toEqual({
      id: NOTE_ID,
      input: { bucket: 'projects', tags: ['work/alpha', 'ai/agents'] },
    });
  });

  it('should drop a tag the author toggled off', async () => {
    const user = userEvent.setup();
    await renderCard();

    await user.click(screen.getByRole('button', { name: /ai\/agents/ }));
    await user.click(screen.getByText('organization.suggestion.apply'));

    expect(updateNote.mock.calls[0][0].input).toEqual({
      bucket: 'projects',
      tags: ['work/alpha'],
    });
  });

  it('should leave the bucket alone when the author rejects the move', async () => {
    const user = userEvent.setup();
    await renderCard();

    await user.click(screen.getByRole('button', { name: /buckets.projects/ }));
    await user.click(screen.getByText('organization.suggestion.apply'));

    expect(updateNote.mock.calls[0][0].input).toEqual({
      tags: ['work/alpha', 'ai/agents'],
    });
  });

  it('should refuse to apply once every chip is rejected', async () => {
    const user = userEvent.setup();
    await renderCard();

    await user.click(screen.getByRole('button', { name: /buckets.projects/ }));
    await user.click(screen.getByRole('button', { name: /work\/alpha/ }));
    await user.click(screen.getByRole('button', { name: /ai\/agents/ }));

    expect(screen.getByText('organization.suggestion.apply')).toBeDisabled();
  });

  it('should keep the tags the note already carries', async () => {
    const user = userEvent.setup();
    await renderCard({ currentTags: ['reading'] });

    await user.click(screen.getByText('organization.suggestion.apply'));

    expect(updateNote.mock.calls[0][0].input.tags).toEqual([
      'reading',
      'work/alpha',
      'ai/agents',
    ]);
  });

  it('should not offer a tag the note already carries', async () => {
    await renderCard({ currentTags: ['work/alpha'] });

    expect(
      screen.queryByRole('button', { name: /work\/alpha/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ai\/agents/ })).toBeVisible();
  });

  it('should keep a tag the note already carries in the update', async () => {
    const user = userEvent.setup();
    await renderCard({ currentTags: ['work/alpha'] });

    await user.click(screen.getByText('organization.suggestion.apply'));

    expect(updateNote.mock.calls[0][0].input.tags).toEqual([
      'work/alpha',
      'ai/agents',
    ]);
  });

  it('should not offer the bucket the note is already in', async () => {
    await renderCard({ currentBucket: 'projects' });

    expect(
      screen.queryByRole('button', { name: /buckets.projects/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('organization.suggestion.moveTo')).toBeNull();
  });

  it('should not offer more tags than the note has room for', async () => {
    const user = userEvent.setup();
    const nearlyFull = Array.from(
      { length: TAG_MAX_PER_NOTE - 1 },
      (_, index) => `existing/${index}`
    );
    await renderCard({ currentTags: nearlyFull });

    expect(screen.getByRole('button', { name: /work\/alpha/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /ai\/agents/ })
    ).not.toBeInTheDocument();

    await user.click(screen.getByText('organization.suggestion.apply'));

    expect(updateNote.mock.calls[0][0].input.tags).toHaveLength(
      TAG_MAX_PER_NOTE
    );
  });

  it('should say so when applying the suggestion fails', async () => {
    updateNote.mockImplementation((_vars, handlers) => handlers.onError?.());
    const user = userEvent.setup();
    await renderCard();

    await user.click(screen.getByText('organization.suggestion.apply'));

    expect(toastError).toHaveBeenCalledWith(
      'organization.suggestion.applyFailed'
    );
  });
});
