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
import { render, screen } from '@testing-library/react';
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

const recentNotes = vi.fn<() => RecentNote[] | undefined>();
const createNote = vi.fn();

vi.mock('@knowtis/data-access-notes', () => ({
  useRecentNotes: () => ({ data: recentNotes() }),
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
    recentNotes.mockReturnValue([
      { id: 'note-1', title: 'Roadmap', accessLevel: 'owner' },
      { id: 'note-2', title: 'Shared with me', accessLevel: 'viewer' },
    ]);
  });

  it('should sit a note row on the rail every organization list shares', async () => {
    await renderAt('/notes');

    const row = rowFor('Roadmap');

    expect(row).toHaveClass(...NAV_ROW.split(' '));
    expect(row?.firstElementChild).toHaveClass(...NAV_ICON_SLOT.split(' '));
    expect(screen.getByText('Roadmap')).toHaveClass(...NAV_LABEL.split(' '));
  });

  it('should not indent the note list off the shared rail', async () => {
    await renderAt('/notes');

    const list = rowFor('Roadmap')?.parentElement?.parentElement;

    expect(list).not.toHaveClass('pl-2');
  });

  it('should keep a note row within the panel', async () => {
    recentNotes.mockReturnValue([
      { id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' },
    ]);

    await renderAt('/notes');

    const row = rowFor(LONG_TITLE);

    expect(row).toHaveClass('min-w-0', 'flex-1');
    expect(row).not.toHaveAttribute('title');
    expect(row?.parentElement).toHaveClass('min-w-0', 'w-full');
    expect(screen.getByText(LONG_TITLE)).toHaveClass(...NAV_LABEL.split(' '));
  });

  it('should reveal the full note title on keyboard focus', async () => {
    const user = userEvent.setup();
    recentNotes.mockReturnValue([
      { id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' },
    ]);
    await renderAt('/notes');
    const row = rowFor(LONG_TITLE);

    screen.getByRole('button', { name: 'sidebar.newNote' }).focus();
    await user.tab();

    expect(row).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_TITLE);
  });

  it('should reveal the full note title on hover', async () => {
    const user = userEvent.setup();
    recentNotes.mockReturnValue([
      { id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' },
    ]);
    await renderAt('/notes');

    await user.hover(rowFor(LONG_TITLE) as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(LONG_TITLE);
  });

  it('should leave the note link name and target untouched by the tooltip', async () => {
    recentNotes.mockReturnValue([
      { id: 'note-1', title: LONG_TITLE, accessLevel: 'owner' },
    ]);

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
    expect(row?.firstElementChild?.querySelector('svg')).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'labels.notes' }));

    expect(screen.queryByText('sidebar.allNotes')).not.toBeInTheDocument();
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
  });

  it('should keep the new-note button clickable above the row-wide All notes link', async () => {
    await renderAt('/notes');

    expect(screen.getByTitle('sidebar.newNote')).toHaveClass(
      'relative',
      'z-10',
      'size-6'
    );
    expect(rowFor('sidebar.allNotes')).toHaveClass(
      'after:absolute',
      'after:inset-0',
      "after:content-['']"
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

  it('should mark the open note as the active row', async () => {
    await renderAt('/notes/note-1');

    expect(rowFor('Roadmap')).toHaveClass('bg-muted');
    expect(rowFor('Shared with me')).not.toHaveClass('bg-muted');
  });
});
