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
} from '@/components/organization/nav-row.styles';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarNotesSection } from './SidebarNotesSection';

interface RecentNote {
  id: string;
  title: string;
  accessLevel: 'owner' | 'editor' | 'viewer';
}

const recentNotes = vi.fn<() => RecentNote[] | undefined>();

vi.mock('@knowtis/data-access-notes', () => ({
  useRecentNotes: () => ({ data: recentNotes() }),
}));
vi.mock('@/hooks/useCreateNoteAction', () => ({
  useCreateNoteAction: () => ({ createNote: vi.fn() }),
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
      <>
        <SidebarNotesSection />
        <Outlet />
      </>
    ),
  });
  const notesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notes',
    component: () => <p>list</p>,
  });
  const noteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notes/$noteId',
    component: () => <p>editor</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([notesRoute, noteRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  const result = render(<RouterProvider router={router} />);
  await screen.findByText('sidebar.myNotes');
  return result;
}

const rowFor = (label: string) => screen.getByText(label).closest('a');

describe('SidebarNotesSection', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('should sit the My Notes row on the same rail as the notes below it', async () => {
    await renderAt('/notes');

    const row = rowFor('sidebar.myNotes')?.parentElement;

    expect(row).toHaveClass(...NAV_ROW.split(' '));
    expect(row?.firstElementChild).toHaveClass(...NAV_ICON_SLOT.split(' '));
    expect(screen.getByText('sidebar.myNotes')).toHaveClass(
      ...NAV_LABEL.split(' ')
    );
  });

  it('should keep the collapse toggle clickable above the row-wide My Notes link', async () => {
    await renderAt('/notes');

    const toggle = screen.getByTitle('labels.collapse');

    expect(toggle).toHaveClass('relative', 'z-10');
    expect(rowFor('sidebar.myNotes')).toHaveClass(
      'after:absolute',
      'after:inset-0',
      "after:content-['']"
    );
  });

  it('should keep the note actions menu above its row link', async () => {
    await renderAt('/notes');

    const menu = screen.getByLabelText('actions:Roadmap');

    expect(menu.parentElement).toHaveClass('absolute', 'z-10');
    expect(screen.queryByLabelText('actions:Shared with me')).toBeNull();
  });

  it('should mark the open note as the active row', async () => {
    await renderAt('/notes/note-1');

    expect(rowFor('Roadmap')).toHaveClass('bg-muted');
    expect(rowFor('Shared with me')).not.toHaveClass('bg-muted');
  });
});
