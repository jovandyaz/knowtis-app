import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import {
  NAV_ICON_SLOT,
  NAV_LABEL,
  NAV_ROW,
  NAV_ROW_ACTIVE,
  NAV_ROW_IDLE,
} from '@/components/organization/nav-row.styles';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { SidebarNotesSection } from './SidebarNotesSection';

interface RecentNote {
  id: string;
  title: string;
  accessLevel: 'owner' | 'editor' | 'viewer';
}

const LONG_TITLE =
  'A note title far wider than the sidebar panel it has to live inside';

interface RecentNotesQuery {
  data?: RecentNote[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

const recentNotesQuery = vi.fn<() => RecentNotesQuery>();
const createNote = vi.fn();
const refetch = vi.fn<() => Promise<unknown>>();

const loaded = (notes: RecentNote[]): RecentNotesQuery => ({
  data: notes,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch,
});
const loading = (): RecentNotesQuery => ({
  isPending: true,
  isError: false,
  isFetching: true,
  refetch,
});
const failed = (notes?: RecentNote[]): RecentNotesQuery => ({
  ...(notes ? { data: notes } : {}),
  isPending: false,
  isError: true,
  isFetching: false,
  refetch,
});
const retrying = (): RecentNotesQuery => ({
  isPending: true,
  isError: false,
  isFetching: true,
  refetch,
});

const showNotes = (notes: RecentNote[]) =>
  recentNotesQuery.mockReturnValue(loaded(notes));

vi.mock('@knowtis/data-access-notes', () => ({
  useRecentNotes: () => recentNotesQuery(),
}));
vi.mock('@/hooks/useCreateNoteAction', () => ({
  useCreateNoteAction: () => ({ createNote }),
}));
vi.mock('@/lib/preload-editor', () => ({
  preloadEditorChunk: vi.fn(),
}));
vi.mock('@/components/notes/NoteActionsMenu', () => ({
  NoteActionsMenu: ({ noteTitle }: { noteTitle: string }) => (
    <button type="button" aria-label={`actions:${noteTitle}`} />
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <TooltipProvider delayDuration={0}>
        <SidebarNotesSection />
        <Outlet />
      </TooltipProvider>
    ),
  });
  const notesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notes',
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <p>list</p>,
  });
  const noteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notes/$noteId',
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <p>editor</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([notesRoute, noteRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  const result = render(<RouterProvider router={router} />);
  await screen.findByText('sidebar.allNotes');
  return { ...result, router };
}

const rowFor = (label: string) => screen.getByText(label).closest('a');

describe('SidebarNotesSection', () => {
  beforeEach(() => {
    localStorage.clear();
    createNote.mockClear();
    refetch.mockReset();
    refetch.mockResolvedValue(undefined);
    showNotes([
      { id: 'note-1', title: 'Roadmap', accessLevel: 'owner' },
      { id: 'note-2', title: 'Shared with me', accessLevel: 'viewer' },
    ]);
  });

  it('should sit a note row on the rail every organization list shares', async () => {
    await renderAt('/notes');

    const row = rowFor('Roadmap');

    expect(row).toHaveClass(...NAV_ROW.split(' '));
    expect(row?.firstElementChild).toHaveClass(...NAV_ICON_SLOT.split(' '));
    expect(row?.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(screen.getByText('Roadmap')).toHaveClass(...NAV_LABEL.split(' '));
  });

  it('should not indent the note list off the shared rail', async () => {
    await renderAt('/notes');

    const list = rowFor('Roadmap')?.parentElement?.parentElement;

    expect(list).not.toHaveClass('pl-2');
  });

  it('should keep a note row within the panel', async () => {
    showNotes([{ id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' }]);

    await renderAt('/notes');

    const row = rowFor(LONG_TITLE);

    expect(row).toHaveClass('min-w-0', 'flex-1');
    expect(row).not.toHaveAttribute('title');
    expect(row?.parentElement).toHaveClass('min-w-0', 'w-full');
    expect(screen.getByText(LONG_TITLE)).toHaveClass(...NAV_LABEL.split(' '));
  });

  it('should reveal two title lines to coarse pointers without covering its action', async () => {
    showNotes([{ id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' }]);

    await renderAt('/notes');

    const row = rowFor(LONG_TITLE);
    const label = screen.getByText(LONG_TITLE);

    expect(row).toHaveClass('pointer-coarse:pr-12');
    expect(row).toHaveClass('pointer-coarse:min-h-11');
    expect(label).toHaveClass(
      'truncate',
      'pointer-coarse:line-clamp-2',
      'pointer-coarse:whitespace-normal',
      'pointer-coarse:break-words',
      'pointer-coarse:text-clip'
    );
    expect(screen.getByLabelText(`actions:${LONG_TITLE}`)).toBeInTheDocument();
  });

  it('should reveal the full note title on keyboard focus', async () => {
    const user = userEvent.setup();
    showNotes([{ id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' }]);
    await renderAt('/notes');
    const row = rowFor(LONG_TITLE);

    act(() => screen.getByRole('button', { name: 'sidebar.newNote' }).focus());
    await user.tab();

    expect(row).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_TITLE);
  });

  it('should reveal the full note title on hover', async () => {
    const user = userEvent.setup();
    showNotes([{ id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' }]);
    await renderAt('/notes');

    await user.hover(rowFor(LONG_TITLE) as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_TITLE);
  });

  it('should leave the note link name and target untouched by the tooltip', async () => {
    showNotes([{ id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' }]);

    await renderAt('/notes');

    const row = rowFor(LONG_TITLE);

    expect(row).toHaveAccessibleName(LONG_TITLE);
    expect(row).toHaveAttribute('href', '/notes/note-1');
  });

  it('should sit the All notes row on the same rail as the notes below it', async () => {
    await renderAt('/notes');

    const row = rowFor('sidebar.allNotes')?.parentElement;

    expect(row).toHaveClass(...NAV_ROW.split(' '));
    expect(row?.firstElementChild).toHaveClass(...NAV_ICON_SLOT.split(' '));
    expect(row?.firstElementChild?.querySelector('svg')).toHaveClass(
      'h-4',
      'w-4'
    );
    expect(screen.getByText('sidebar.allNotes')).toHaveClass(
      ...NAV_LABEL.split(' ')
    );
  });

  it('should link the All notes row to the unfiltered note list', async () => {
    await renderAt('/notes');

    expect(rowFor('sidebar.allNotes')).toHaveAttribute(
      'href',
      '/notes?view=all'
    );
  });

  it('should mark the All notes row as the current page on the unfiltered list', async () => {
    await renderAt('/notes');

    const row = rowFor('sidebar.allNotes');

    expect(row).toHaveAttribute('aria-current', 'page');
    expect(row?.parentElement).toHaveClass(...NAV_ROW_ACTIVE.split(' '));
  });

  it('should leave the All notes row idle while a note is open', async () => {
    await renderAt('/notes/note-1');

    const row = rowFor('sidebar.allNotes');

    expect(row).not.toHaveAttribute('aria-current');
    expect(row?.parentElement).toHaveClass(...NAV_ROW_IDLE.split(' '));
  });

  it.each([
    '/notes?bucket=projects&view=all',
    '/notes?tag=work',
    '/notes?supertag=book',
    '/notes?view=mine',
  ])('should leave the All notes row idle on %s', async (path) => {
    await renderAt(path);

    const row = rowFor('sidebar.allNotes');

    expect(row).not.toHaveAttribute('aria-current');
    expect(row?.parentElement).toHaveClass(...NAV_ROW_IDLE.split(' '));
  });

  it('should fold the whole section away from its own header', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');
    expect(screen.getByText('Roadmap')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'sidebar.recentNotes' })
    );

    expect(screen.queryByText('sidebar.allNotes')).not.toBeInTheDocument();
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
  });

  it('should keep the new-note button clickable above the row-wide All notes link', async () => {
    await renderAt('/notes');

    const newNote = screen.getByRole('button', { name: 'sidebar.newNote' });

    expect(newNote).toHaveClass('relative', 'z-10', 'size-6');
    expect(newNote.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(rowFor('sidebar.allNotes')).toHaveClass(
      'after:absolute',
      'after:inset-0',
      "after:content-['']"
    );
  });

  it('should explain the new-note action once and reveal its tooltip on hover', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    const newNote = screen.getByRole('button', { name: 'sidebar.newNote' });

    expect(newNote).toHaveAttribute('aria-label', 'sidebar.newNote');
    expect(newNote).not.toHaveAttribute('title');

    await user.hover(newNote);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'sidebar.newNote'
    );
  });

  it('should create a note from the row button without navigating away', async () => {
    const user = userEvent.setup();
    const { router } = await renderAt('/notes');
    const button = screen.getByRole('button', { name: 'sidebar.newNote' });

    await user.click(button);

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(button.closest('a')).toBeNull();
    expect(router.state.location.pathname).toBe('/notes');
  });

  it('should keep the note actions menu above its row link', async () => {
    await renderAt('/notes');

    const menu = screen.getByLabelText('actions:Roadmap');

    expect(menu.parentElement).toHaveClass('absolute', 'z-10');
    expect(screen.queryByLabelText('actions:Shared with me')).toBeNull();
  });

  it('should hide note actions only from fine pointers at desktop widths', async () => {
    await renderAt('/notes');

    const wrapper = screen.getByLabelText('actions:Roadmap').parentElement;

    expect(wrapper).toHaveClass(
      'opacity-100',
      'md:pointer-fine:opacity-0',
      'md:pointer-fine:group-hover/note:opacity-100',
      'md:pointer-fine:focus-within:opacity-100'
    );
    expect(wrapper).not.toHaveClass('md:opacity-0');
  });

  it('should open the note when its row is clicked', async () => {
    const user = userEvent.setup();
    const { router } = await renderAt('/notes');
    const row = rowFor('Roadmap') as HTMLElement;

    await user.click(row);

    expect(await screen.findByText('editor')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/notes/note-1');
  });

  it('should keep the note actions menu reachable beside the tooltipped link', async () => {
    const user = userEvent.setup();
    const { router } = await renderAt('/notes');

    await user.click(screen.getByLabelText('actions:Roadmap'));

    expect(router.state.location.pathname).toBe('/notes');
  });

  it('should stand three placeholder rows in for the first page while it loads', async () => {
    recentNotesQuery.mockReturnValue(loading());

    await renderAt('/notes');

    const skeletons = screen.getByRole('status', {
      name: 'states.loading',
    }).children;
    expect(skeletons).toHaveLength(3);
    for (const skeleton of Array.from(skeletons)) {
      expect(skeleton).toHaveClass('h-8', 'pointer-coarse:h-11');
    }
    expect(screen.queryByText('sidebar.noNotesYet')).not.toBeInTheDocument();
    expect(screen.queryByText('sidebar.loadFailed')).not.toBeInTheDocument();
  });

  it('should call a collection empty only once the fetch has succeeded', async () => {
    showNotes([]);

    await renderAt('/notes');

    expect(screen.getByText('sidebar.noNotesYet')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('should announce a load failure from the live region mounted before it', async () => {
    const { router } = await renderAt('/notes');
    const liveRegion = screen.getByRole('status');

    expect(liveRegion).toBeEmptyDOMElement();
    expect(liveRegion).toHaveClass('sr-only');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');

    recentNotesQuery.mockReturnValue(failed());
    await act(async () => {
      await router.navigate({ to: '/notes', search: { view: 'mine' } });
    });

    expect(screen.getByRole('status')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent('sidebar.loadFailed');
  });

  it('should explain a failed first load and retry it on request', async () => {
    const user = userEvent.setup();
    recentNotesQuery.mockReturnValue(failed());
    await renderAt('/notes');
    expect(screen.getAllByText('sidebar.loadFailed')).toHaveLength(2);
    expect(screen.queryByText('sidebar.noNotesYet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'sidebar.retry' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('should keep the error visible, focus and progress during a retry', async () => {
    const user = userEvent.setup();
    recentNotesQuery.mockReturnValue(failed());
    refetch.mockImplementation(() => {
      recentNotesQuery.mockReturnValue(retrying());
      return new Promise(() => undefined);
    });

    const view = await renderAt('/notes');

    await user.click(screen.getByRole('button', { name: 'sidebar.retry' }));
    view.rerender(<RouterProvider router={view.router} />);

    const retry = screen.getByRole('button', { name: 'states.loading' });
    expect(retry.parentElement).toHaveTextContent('sidebar.loadFailed');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(retry).toHaveFocus();
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(retry.querySelector('svg')).toHaveClass(
      'animate-spin',
      'motion-reduce:animate-none'
    );

    await user.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('should keep the notes on screen when a background refetch fails', async () => {
    recentNotesQuery.mockReturnValue(
      failed([{ id: 'note-1', title: 'Roadmap', accessLevel: 'owner' }])
    );

    await renderAt('/notes');

    expect(rowFor('Roadmap')).toBeInTheDocument();
    expect(screen.getAllByText('sidebar.loadFailed')).toHaveLength(2);
  });

  it('should keep the All notes row pinned above the collection', async () => {
    await renderAt('/notes');

    const allNotes = rowFor('sidebar.allNotes') as HTMLElement;
    const firstNote = rowFor('Roadmap') as HTMLElement;

    expect(
      allNotes.compareDocumentPosition(firstNote) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('should mark the open note as the active row', async () => {
    await renderAt('/notes/note-1');

    expect(rowFor('Roadmap')).toHaveClass('bg-muted');
    expect(rowFor('Shared with me')).not.toHaveClass('bg-muted');
  });
});
