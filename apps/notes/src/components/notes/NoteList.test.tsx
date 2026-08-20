import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';

import { notesSearchSchema } from '@/routes/_app/notes/index';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteWithAccess } from '@knowtis/api-client';
import type { NotesListFilters } from '@knowtis/shared-types';

import { NoteList } from './NoteList';

interface NotesQueryResult {
  data?: NoteWithAccess[];
  isLoading: boolean;
  isError: boolean;
  error?: Error;
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
  useTranslation: () => ({ t: (key: string) => key }),
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
    useNotes.mockReturnValue({ data: [], isLoading: false, isError: false });
    authUser.mockReturnValue({ isAnonymous: false });
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

  it('still lists notes for an anonymous visitor landing on a shared view', async () => {
    authUser.mockReturnValue({ isAnonymous: true });
    useNotes.mockReturnValue({
      data: [note('note-1', 'Anonymous note')],
      isLoading: false,
      isError: false,
    });

    await renderAt('/notes?view=shared');

    expect(screen.getByText('Anonymous note')).toBeInTheDocument();
    expect(lastFilters()).toEqual({ view: 'shared' });
  });
});
