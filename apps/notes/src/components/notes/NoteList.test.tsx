import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';

import { notesSearchSchema } from '@/routes/_app/notes/index';
import { useNotesSearchStore } from '@/stores/notes-search.store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteWithAccess } from '@knowtis/api-client';
import type { NotesListFilters, NotesPage } from '@knowtis/shared-types';

import { NoteList } from './NoteList';

interface NotesQueryResult {
  data?: { pages: NotesPage<NoteWithAccess>[] };
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

const fetchNextPage = vi.fn();

function loaded(
  items: NoteWithAccess[],
  total = items.length
): NotesQueryResult {
  return {
    data: { pages: [{ items, total, page: 1, limit: 25 }] },
    isLoading: false,
    isError: false,
    fetchNextPage,
    hasNextPage: total > items.length,
    isFetchingNextPage: false,
  };
}

function pending(overrides: Partial<NotesQueryResult>): NotesQueryResult {
  return {
    isLoading: false,
    isError: false,
    fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  };
}

const useNotes = vi.fn<(filters?: NotesListFilters) => NotesQueryResult>();
const authUser = vi.fn<() => { isAnonymous: boolean }>();

vi.mock('@knowtis/data-access-notes', () => ({
  useNotes: (filters?: NotesListFilters) => useNotes(filters),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts?.count === undefined ? key : `${key}:${opts.count}`,
  }),
}));
vi.mock('@/hooks/useCreateNoteAction', () => ({
  useCreateNoteAction: () => ({ createNote: vi.fn() }),
}));
vi.mock('@/stores/ai.store', () => ({
  useAIStore: (selector: (s: { aiEnabled: boolean }) => unknown) =>
    selector({ aiEnabled: false }),
}));
vi.mock('./NoteCard', () => ({
  NoteCard: ({ note }: { note: NoteWithAccess }) => (
    <article>{note.title}</article>
  ),
}));

const note = (id: string, title: string): NoteWithAccess => ({
  id,
  title,
  content: '',
  ownerId: 'user-1',
  accessLevel: 'owner',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  shareToken: null,
  editorsCanShare: false,
  bucket: null,
  tags: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

async function renderAt(path: string) {
  const rootRoute = createRootRoute();
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_app',
  });
  const notesRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '/notes/',
    validateSearch: notesSearchSchema,
    component: NoteList,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([appRoute.addChildren([notesRoute])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  const result = render(<RouterProvider router={router} />);
  await screen.findByPlaceholderText('list.searchPlaceholder');
  return { ...result, router };
}

const lastFilters = () => useNotes.mock.calls.at(-1)?.[0];

describe('NoteList', () => {
  beforeEach(() => {
    useNotes.mockReset();
    useNotes.mockReturnValue(loaded([]));
    authUser.mockReturnValue({ isAnonymous: false });
    useNotesSearchStore.setState({ query: '', focusRequested: false });
  });

  it('offers the view picker to a signed-up user', async () => {
    await renderAt('/notes');

    expect(
      screen.getByRole('radiogroup', { name: 'organization.viewsLabel' })
    ).toBeInTheDocument();
  });

  it('hides the view picker from an anonymous visitor', async () => {
    authUser.mockReturnValue({ isAnonymous: true });

    await renderAt('/notes');

    expect(
      screen.queryByRole('radiogroup', { name: 'organization.viewsLabel' })
    ).not.toBeInTheDocument();
  });

  it('ignores a view left in the URL for an anonymous visitor', async () => {
    authUser.mockReturnValue({ isAnonymous: true });
    useNotes.mockReturnValue(loaded([note('note-1', 'Anonymous note')]));

    await renderAt('/notes?view=shared');

    expect(screen.getByText('Anonymous note')).toBeInTheDocument();
    expect(lastFilters()).toEqual({});
  });

  it('omits the default view from the filters so the cache key stays shared', async () => {
    await renderAt('/notes?view=all');

    expect(lastFilters()).toEqual({});
  });

  it('carries the search, bucket and view filters that are set', async () => {
    useNotesSearchStore.setState({ query: 'yjs' });

    await renderAt('/notes?bucket=areas&view=mine');

    expect(lastFilters()).toEqual({
      search: 'yjs',
      bucket: 'areas',
      view: 'mine',
    });
  });

  it('drops the bucket and keeps the view when the bucket chip is cleared', async () => {
    const user = userEvent.setup();

    const { router } = await renderAt('/notes?bucket=projects&view=mine');
    await user.click(
      screen.getByRole('button', { name: 'organization.clearBucketFilter' })
    );

    await waitFor(() => {
      expect(router.state.location.searchStr).toBe('?view=mine');
    });
    expect(lastFilters()).toEqual({ view: 'mine' });
  });

  it('offers the bucket empty state while a bucket is active', async () => {
    await renderAt('/notes?bucket=projects');

    expect(
      screen.getByText('organization.empty.bucketTitle')
    ).toBeInTheDocument();
    expect(screen.queryByText('list.startCollection')).not.toBeInTheDocument();
  });

  it('falls back to the plain empty state with no bucket active', async () => {
    await renderAt('/notes');

    expect(screen.getByText('list.startCollection')).toBeInTheDocument();
    expect(
      screen.queryByText('organization.empty.bucketTitle')
    ).not.toBeInTheDocument();
  });

  it('explains an empty view rather than claiming the user has no notes', async () => {
    await renderAt('/notes?view=shared');

    expect(
      screen.getByText('organization.empty.sharedTitle')
    ).toBeInTheDocument();
    expect(screen.queryByText('list.startCollection')).not.toBeInTheDocument();
  });

  it('prefers the bucket empty state when both a bucket and a view are set', async () => {
    await renderAt('/notes?bucket=projects&view=mine');

    expect(
      screen.getByText('organization.empty.bucketTitle')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('organization.empty.mineTitle')
    ).not.toBeInTheDocument();
  });

  it('counts the notes in the active bucket once they have loaded', async () => {
    useNotes.mockReturnValue(
      loaded([note('note-1', 'One'), note('note-2', 'Two')])
    );

    await renderAt('/notes?bucket=projects');

    expect(screen.getByText('organization.notesCount:2')).toBeInTheDocument();
  });

  it('renders every loaded page as one grid', async () => {
    useNotes.mockReturnValue({
      data: {
        pages: [
          { items: [note('a', 'First')], total: 2, page: 1, limit: 1 },
          { items: [note('b', 'Second')], total: 2, page: 2, limit: 1 },
        ],
      },
      isLoading: false,
      isError: false,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    await renderAt('/notes');

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('counts every note the server reports, not just the loaded ones', async () => {
    useNotes.mockReturnValue(loaded([note('note-1', 'One')], 287));

    await renderAt('/notes?bucket=projects');

    expect(screen.getByText('organization.notesCount:287')).toBeInTheDocument();
  });

  it('hides the count while the notes are loading', async () => {
    useNotes.mockReturnValue(pending({ isLoading: true }));

    await renderAt('/notes?bucket=projects');

    expect(
      screen.queryByText(/^organization\.notesCount/)
    ).not.toBeInTheDocument();
  });

  it('hides the count when the notes fail to load', async () => {
    useNotes.mockReturnValue(
      pending({ isError: true, error: new Error('boom') })
    );

    await renderAt('/notes?bucket=projects');

    expect(screen.getByText('list.errorLoading')).toBeInTheDocument();
    expect(
      screen.queryByText(/^organization\.notesCount/)
    ).not.toBeInTheDocument();
  });
});
