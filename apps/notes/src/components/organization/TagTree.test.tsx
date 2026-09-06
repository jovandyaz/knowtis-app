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

import type { TagNode } from '@knowtis/shared-types';

import { TagTree } from './TagTree';

const tagTree = vi.fn<() => TagNode[] | undefined>();
const updateTag = vi.fn();
const deleteTag = vi.fn();

vi.mock('@knowtis/data-access-notes', () => ({
  useTags: () => ({ data: tagTree() }),
  useUpdateTag: () => ({ mutate: updateTag, isPending: false }),
  useDeleteTag: () => ({ mutate: deleteTag, isPending: false }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars?.['tag'] ? `${key}:${vars['tag']}` : key,
  }),
}));

const node = (path: string, noteCount = 0): TagNode => ({
  id: `id-${path}`,
  path,
  color: null,
  noteCount,
});

async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TagTree />
        <Outlet />
      </>
    ),
  });
  const notesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notes',
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => <p>list</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([notesRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  const result = render(<RouterProvider router={router} />);
  await screen.findByText('organization.tagsTitle');
  return { ...result, router };
}

const rowFor = (label: string) => screen.getByText(label).closest('a');

describe('TagTree', () => {
  beforeEach(() => {
    updateTag.mockReset();
    deleteTag.mockReset();
    tagTree.mockReturnValue([
      node('work', 5),
      node('work/alpha', 2),
      node('personal', 1),
    ]);
  });

  it('should render nothing until the vocabulary has tags', () => {
    tagTree.mockReturnValue([]);
    const rootRoute = createRootRoute({ component: () => <TagTree /> });
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/notes'] }),
    });

    render(<RouterProvider router={router} />);

    expect(
      screen.queryByText('organization.tagsTitle')
    ).not.toBeInTheDocument();
  });

  it('should show a nested tag by its last segment only', async () => {
    await renderAt('/notes');

    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('work/alpha')).not.toBeInTheDocument();
  });

  it('should link a tag to the list filtered by its full path', async () => {
    await renderAt('/notes');

    expect(rowFor('alpha')).toHaveAttribute(
      'href',
      expect.stringContaining('tag=work%2Falpha')
    );
  });

  // The raw search string is what Link compares against, and the schema's
  // defaults never reach it — the same trap that broke the F1 bucket highlight.
  it('should mark only the tag named in the url as current', async () => {
    await renderAt('/notes?tag=work');

    expect(rowFor('work')).toHaveAttribute('aria-current', 'page');
    expect(rowFor('alpha')).not.toHaveAttribute('aria-current');
    expect(rowFor('personal')).not.toHaveAttribute('aria-current');
  });

  it('should not mark an ancestor as current when a descendant is filtered', async () => {
    await renderAt('/notes?tag=work%2Falpha');

    expect(rowFor('alpha')).toHaveAttribute('aria-current', 'page');
    expect(rowFor('work')).not.toHaveAttribute('aria-current');
  });

  it('should hide descendants when a branch is collapsed', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    await user.click(
      screen.getByRole('button', { name: 'organization.tags.collapse:work' })
    );

    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('should show the note count a branch reports', async () => {
    await renderAt('/notes');

    expect(rowFor('work')).toHaveTextContent('5');
  });

  it('should hang a branch and a leaf on the same icon rail', async () => {
    await renderAt('/notes');

    const slotOf = (label: string) =>
      rowFor(label)?.parentElement?.firstElementChild;

    expect(slotOf('work')).toHaveClass('w-3', 'shrink-0');
    expect(slotOf('personal')).toHaveClass('w-3', 'shrink-0');
  });

  it('should let a long tag ellipsise rather than squeeze its icon slot', async () => {
    await renderAt('/notes');

    expect(screen.getByText('personal')).toHaveClass('min-w-0', 'truncate');
  });

  it('should let the whole row reach the tag, not just the label', async () => {
    await renderAt('/notes');

    expect(rowFor('personal')?.parentElement).toHaveClass('relative');
    // A ::after with no content value generates no box, so that class carries the hit area.
    expect(rowFor('personal')).toHaveClass(
      'after:absolute',
      'after:inset-0',
      "after:content-['']"
    );
  });

  it('should keep the collapse control above the row-wide link', async () => {
    await renderAt('/notes');

    const chevron = screen.getByRole('button', {
      name: /organization.tags.collapse/,
    });

    expect(chevron).toHaveClass('relative', 'z-10');
  });

  it('should give the collapse control a touch-sized target on mobile', async () => {
    await renderAt('/notes');

    const chevron = screen.getByRole('button', {
      name: /organization.tags.collapse/,
    });

    expect(chevron).toHaveClass(
      'after:absolute',
      "after:content-['']",
      'after:-inset-x-2',
      'after:-inset-y-4',
      'md:after:-inset-y-1'
    );
    expect(chevron.querySelector('svg')).toHaveClass('h-3', 'w-3');
  });

  it('should hand the collapse control the row colour rather than the tag colour', async () => {
    tagTree.mockReturnValue([
      { id: 'id-pale', path: 'pale', color: 'yellow', noteCount: 1 },
      { id: 'id-pale-child', path: 'pale/child', color: null, noteCount: 1 },
    ]);
    await renderAt('/notes');

    const chevron = screen.getByRole('button', {
      name: /organization.tags.collapse/,
    });

    expect(chevron.querySelector('svg')).not.toHaveClass('text-tag-yellow');
  });

  it('should still show a branch colour, which its chevron cannot carry', async () => {
    tagTree.mockReturnValue([
      { id: 'id-pale', path: 'pale', color: 'yellow', noteCount: 1 },
      { id: 'id-pale-child', path: 'pale/child', color: null, noteCount: 1 },
    ]);
    await renderAt('/notes');

    expect(
      rowFor('pale')?.parentElement?.querySelector('.bg-tag-yellow')
    ).toBeInTheDocument();
  });

  it('should tint a leaf hash with the tag palette token', async () => {
    tagTree.mockReturnValue([
      { id: 'id-pale', path: 'pale', color: 'yellow', noteCount: 1 },
    ]);
    await renderAt('/notes');

    expect(rowFor('pale')?.parentElement?.querySelector('svg')).toHaveClass(
      'text-tag-yellow'
    );
  });

  it('should give a tag row a touch-sized height on mobile', async () => {
    await renderAt('/notes');

    expect(rowFor('personal')?.parentElement).toHaveClass(
      'min-h-11',
      'md:min-h-8'
    );
  });
  const openMenuFor = async (
    user: ReturnType<typeof userEvent.setup>,
    path: string
  ) => {
    await user.click(
      screen.getByRole('button', {
        name: `organization.tags.actionsLabel:${path}`,
      })
    );
  };

  it('should open a rename field seeded with the tag last segment', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'work/alpha');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.rename' })
    );

    expect(
      screen.getByRole('textbox', {
        name: 'organization.tags.renameLabel:alpha',
      })
    ).toHaveValue('alpha');
  });

  it('should rename a nested tag under its existing parent', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'work/alpha');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.rename' })
    );

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'beta{Enter}');

    expect(updateTag).toHaveBeenCalledWith(
      { id: 'id-work/alpha', input: { path: 'work/beta' } },
      expect.anything()
    );
  });

  it('should discard a rename cancelled with Escape', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'personal');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.rename' })
    );

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'private{Escape}');

    expect(updateTag).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('should refuse a rename that collides with a sibling', async () => {
    tagTree.mockReturnValue([
      node('work', 5),
      node('work/alpha', 2),
      node('work/beta', 1),
    ]);
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'work/alpha');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.rename' })
    );

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'beta{Enter}');

    expect(updateTag).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'organization.tags.conflict'
    );
  });

  it('should refuse a segment the server path rules would reject', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'personal');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.rename' })
    );

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'two words{Enter}');

    expect(updateTag).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'organization.tags.invalidSegment'
    );
  });

  it('should carry the active filter onto the renamed path', async () => {
    updateTag.mockImplementation(
      (_variables, options?: { onSuccess?: () => void }) =>
        options?.onSuccess?.()
    );
    const user = userEvent.setup();
    const { router } = await renderAt('/notes?tag=work%2Falpha&view=all');

    await openMenuFor(user, 'work/alpha');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.rename' })
    );

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'beta{Enter}');

    expect(router.state.location.search).toMatchObject({ tag: 'work/beta' });
  });

  it('should recolor a tag with a palette token rather than a raw colour', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'personal');
    await user.click(
      screen.getByRole('menuitemradio', {
        name: 'organization.tags.colors.purple',
      })
    );

    expect(updateTag).toHaveBeenCalledWith(
      { id: 'id-personal', input: { color: 'purple' } },
      expect.anything()
    );
  });

  it('should clear a tag colour through the no-colour choice', async () => {
    tagTree.mockReturnValue([
      { id: 'id-personal', path: 'personal', color: 'purple', noteCount: 1 },
    ]);
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'personal');
    await user.click(
      screen.getByRole('menuitemradio', { name: 'organization.tags.noColor' })
    );

    expect(updateTag).toHaveBeenCalledWith(
      { id: 'id-personal', input: { color: null } },
      expect.anything()
    );
  });

  it('should mark the tag current colour as the checked choice', async () => {
    tagTree.mockReturnValue([
      { id: 'id-personal', path: 'personal', color: 'green', noteCount: 1 },
    ]);
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'personal');

    expect(
      screen.getByRole('menuitemradio', {
        name: 'organization.tags.colors.green',
      })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('should ask before deleting a branch and only then delete it', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'work');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.delete' })
    );

    expect(
      await screen.findByText('organization.tags.deleteConfirm')
    ).toBeInTheDocument();
    expect(deleteTag).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'buttons.delete' }));

    expect(deleteTag).toHaveBeenCalledWith('id-work', expect.anything());
  });

  it('should drop the active filter when its branch is deleted', async () => {
    deleteTag.mockImplementation((_id, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.()
    );
    const user = userEvent.setup();
    const { router } = await renderAt('/notes?tag=work%2Falpha&view=all');

    await openMenuFor(user, 'work');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.delete' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'buttons.delete' })
    );

    expect(router.state.location.search).not.toHaveProperty('tag');
  });
});
