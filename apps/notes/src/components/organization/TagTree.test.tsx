import type { ReactNode } from 'react';

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TagNode } from '@knowtis/shared-types';

import { MobileSheet } from '../layout/MobileSheet';
import { NAV_ROW } from './nav-row.styles';
import { TagTree } from './TagTree';

const tagTree = vi.fn<() => TagNode[] | undefined>();
const updateTag = vi.fn();
const deleteTag = vi.fn();
const tagListeners = new Set<() => void>();

vi.mock('@knowtis/data-access-notes', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    tagListeners.add(listener);
    return () => tagListeners.delete(listener);
  };
  return {
    useTags: () => ({ data: useSyncExternalStore(subscribe, tagTree) }),
    useUpdateTag: () => ({ mutate: updateTag, isPending: false }),
    useDeleteTag: () => ({ mutate: deleteTag, isPending: false }),
  };
});

/** Stands in for the query cache: the optimistic write, a rollback or a refetch. */
function publishTags(nodes: TagNode[]) {
  tagTree.mockReturnValue(nodes);
  tagListeners.forEach((listener) => listener());
}
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

async function renderAt(
  path: string,
  place: (tree: ReactNode) => ReactNode = (tree) => tree
) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        {place(<TagTree />)}
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
    localStorage.clear();
    updateTag.mockReset();
    deleteTag.mockReset();
    tagTree.mockReturnValue([
      node('work', 5),
      node('work/alpha', 2),
      node('personal', 1),
    ]);
  });

  it('should render nothing until the vocabulary has tags', async () => {
    tagTree.mockReturnValue([]);
    const rootRoute = createRootRoute({ component: () => <TagTree /> });
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/notes'] }),
    });

    await act(async () => {
      render(<RouterProvider router={router} />);
    });

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

    expect(slotOf('work')).toHaveClass('w-4', 'shrink-0');
    expect(slotOf('personal')).toHaveClass('w-4', 'shrink-0');
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
    expect(chevron.querySelector('svg')).toHaveClass('h-4', 'w-4');
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
    const label = screen.getByText('pale');
    const trailing = label.nextElementSibling;
    expect(label).toBe(rowFor('pale')?.firstElementChild);
    expect(rowFor('pale')?.previousElementSibling).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(trailing).toHaveClass('flex', 'shrink-0', 'items-center', 'gap-2');
    expect(trailing?.querySelector('.bg-tag-yellow')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(trailing?.lastElementChild).toHaveClass(
      'tabular-nums',
      'text-foreground',
      'dark:text-muted-foreground'
    );
  });

  it('keeps twelve pixels of indentation per level without shifting siblings', async () => {
    tagTree.mockReturnValue([
      node('work', 5),
      node('work/alpha', 2),
      node('work/beta', 1),
      node('work/alpha/deep', 1),
    ]);
    await renderAt('/notes');

    expect(rowFor('alpha')?.parentElement).toHaveStyle({
      marginLeft: '0.75rem',
    });
    expect(rowFor('beta')?.parentElement).toHaveStyle({
      marginLeft: '0.75rem',
    });
    expect(rowFor('deep')?.parentElement).toHaveStyle({ marginLeft: '1.5rem' });
  });

  it('reserves a compact action without removing its touch target', async () => {
    await renderAt('/notes');

    const action = screen.getByRole('button', {
      name: 'organization.tags.actionsLabel:work',
    });
    expect(action.parentElement).toHaveClass(
      'shrink-0',
      'flex',
      'items-center'
    );
    expect(action.parentElement).not.toHaveClass('[&>button]:size-6');
    expect(action).toHaveClass(
      'size-11',
      'md:size-6',
      'pointer-coarse:min-h-11',
      'pointer-coarse:min-w-11'
    );
  });

  it('should tint a leaf hash with the tag palette token', async () => {
    tagTree.mockReturnValue([
      { id: 'id-pale', path: 'pale', color: 'yellow', noteCount: 1 },
    ]);
    await renderAt('/notes');

    expect(rowFor('pale')?.parentElement?.querySelector('svg')).toHaveClass(
      'h-4',
      'w-4',
      'text-tag-yellow'
    );
  });

  it('should give a tag row a touch-sized height on a coarse pointer', async () => {
    await renderAt('/notes');

    const row = rowFor('personal')?.parentElement;
    expect(row).toHaveClass(...NAV_ROW.split(' '));
    expect(row?.className).not.toMatch(/(^|\s)md:min-h-/);
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

  it('should keep the confirmation open while the optimistic write empties the tree', async () => {
    tagTree.mockReturnValue([node('personal', 1)]);
    deleteTag.mockImplementation(() => publishTags([]));
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'personal');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.delete' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'buttons.delete' })
    );

    expect(
      screen.queryByText('organization.tagsTitle')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'organization.tags.deleteTitle' })
    ).toBeInTheDocument();
  });

  it('should not commit a rename on the Enter that closes an IME composition', async () => {
    const user = userEvent.setup();
    await renderAt('/notes');

    await openMenuFor(user, 'personal');
    await user.click(
      screen.getByRole('menuitem', { name: 'organization.tags.rename' })
    );

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'privado');
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });

    expect(updateTag).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should leave a filter the reader changed while the rename was in flight', async () => {
    let settle: (() => void) | undefined;
    updateTag.mockImplementation(
      (_variables, options?: { onSuccess?: () => void }) => {
        settle = () => options?.onSuccess?.();
      }
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

    await user.click(screen.getByRole('link', { name: /personal/ }));
    settle?.();

    expect(router.state.location.search).toMatchObject({ tag: 'personal' });
  });

  describe('focus after a tag action', () => {
    const triggerFor = (path: string) =>
      screen.getByRole('button', {
        name: `organization.tags.actionsLabel:${path}`,
      });

    const settleCloseAutoFocus = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

    const chooseDelete = async (
      user: ReturnType<typeof userEvent.setup>,
      path: string
    ) => {
      await openMenuFor(user, path);
      await user.click(
        screen.getByRole('menuitem', { name: 'organization.tags.delete' })
      );
    };

    const chooseRename = async (
      user: ReturnType<typeof userEvent.setup>,
      path: string
    ) => {
      await openMenuFor(user, path);
      await user.click(
        screen.getByRole('menuitem', { name: 'organization.tags.rename' })
      );
    };

    it('should return to the tag menu when its deletion is cancelled', async () => {
      const user = userEvent.setup();
      await renderAt('/notes');

      await chooseDelete(user, 'work/alpha');
      await user.click(
        await screen.findByRole('button', { name: 'buttons.cancel' })
      );
      await settleCloseAutoFocus();

      expect(triggerFor('work/alpha')).toHaveFocus();
    });

    it('should return to the tag menu when a failed deletion is dismissed', async () => {
      const vocabulary = [
        node('work', 5),
        node('work/alpha', 2),
        node('personal', 1),
      ];
      let fail: (() => void) | undefined;
      deleteTag.mockImplementation(
        (_id, options?: { onError?: () => void }) => {
          publishTags([node('personal', 1)]);
          fail = () => {
            publishTags(vocabulary);
            options?.onError?.();
          };
        }
      );
      const user = userEvent.setup();
      await renderAt('/notes');

      await chooseDelete(user, 'work');
      await user.click(
        await screen.findByRole('button', { name: 'buttons.delete' })
      );
      act(() => fail?.());
      await user.keyboard('{Escape}');
      await settleCloseAutoFocus();

      expect(triggerFor('work')).toHaveFocus();
    });

    it('should move to the next tag past a deleted branch', async () => {
      tagTree.mockReturnValue([
        node('aardvark'),
        node('alpha'),
        node('alpha/one'),
        node('beta'),
      ]);
      deleteTag.mockImplementation(
        (_id, options?: { onSuccess?: () => void }) => {
          publishTags([node('aardvark'), node('beta')]);
          options?.onSuccess?.();
        }
      );
      const user = userEvent.setup();
      await renderAt('/notes');

      await chooseDelete(user, 'alpha');
      await user.click(
        await screen.findByRole('button', { name: 'buttons.delete' })
      );
      await settleCloseAutoFocus();

      expect(triggerFor('beta')).toHaveFocus();
    });

    it('should move to the previous tag when the deleted branch was last', async () => {
      deleteTag.mockImplementation(
        (_id, options?: { onSuccess?: () => void }) => {
          publishTags([node('personal', 1)]);
          options?.onSuccess?.();
        }
      );
      const user = userEvent.setup();
      await renderAt('/notes');

      await chooseDelete(user, 'work');
      await user.click(
        await screen.findByRole('button', { name: 'buttons.delete' })
      );
      await settleCloseAutoFocus();

      expect(triggerFor('personal')).toHaveFocus();
    });

    describe('when the only tag is deleted', () => {
      beforeEach(() => {
        tagTree.mockReturnValue([node('personal', 1)]);
        deleteTag.mockImplementation(
          (_id, options?: { onSuccess?: () => void }) => {
            publishTags([]);
            options?.onSuccess?.();
          }
        );
      });

      const deleteOnlyTag = async () => {
        const user = userEvent.setup();
        await chooseDelete(user, 'personal');
        await user.click(
          await screen.findByRole('button', { name: 'buttons.delete' })
        );
        await settleCloseAutoFocus();
      };

      it('should move to what follows the emptied section in the sidebar', async () => {
        await renderAt('/notes', (tree) => (
          <div style={{ overflowY: 'auto' }}>
            <button type="button">Buckets</button>
            {tree}
            <button type="button">Notes section</button>
          </div>
        ));

        await deleteOnlyTag();

        expect(
          screen.getByRole('button', { name: 'Notes section' })
        ).toHaveFocus();
      });

      it('should fall back to what precedes the section when nothing follows it in its scroll region', async () => {
        await renderAt('/notes', (tree) => (
          <>
            <div style={{ overflowY: 'auto' }}>
              <button type="button">Buckets</button>
              {tree}
            </div>
            <button type="button">Account</button>
          </>
        ));

        await deleteOnlyTag();

        expect(screen.getByRole('button', { name: 'Buckets' })).toHaveFocus();
      });

      it('should move to what follows the emptied section inside the explore sheet', async () => {
        await renderAt('/notes', (tree) => (
          <MobileSheet isOpen onClose={vi.fn()} label="Explore">
            {tree}
            <button type="button">After tags</button>
          </MobileSheet>
        ));

        await deleteOnlyTag();

        expect(
          screen.getByRole('button', { name: 'After tags' })
        ).toHaveFocus();
      });
    });

    it('should return to the tag menu when a rename is cancelled with Escape', async () => {
      const user = userEvent.setup();
      await renderAt('/notes');

      await chooseRename(user, 'personal');
      await user.type(screen.getByRole('textbox'), 'x{Escape}');

      expect(triggerFor('personal')).toHaveFocus();
    });

    it('should keep the explore sheet open when Escape cancels a rename', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      await renderAt('/notes', (tree) => (
        <MobileSheet isOpen onClose={onClose} label="Explore">
          {tree}
        </MobileSheet>
      ));

      await chooseRename(user, 'personal');
      await user.type(screen.getByRole('textbox'), 'x{Escape}');

      expect(onClose).not.toHaveBeenCalled();
      expect(updateTag).not.toHaveBeenCalled();
      expect(triggerFor('personal')).toHaveFocus();
    });

    it('should keep focus on a renamed tag as the tree re-sorts and rolls it back', async () => {
      const vocabulary = [
        node('work', 5),
        node('work/alpha', 2),
        node('work/beta', 1),
      ];
      tagTree.mockReturnValue(vocabulary);
      let applyOptimistic: (() => void) | undefined;
      let rollBack: (() => void) | undefined;
      updateTag.mockImplementation(
        (_variables, options?: { onError?: () => void }) => {
          applyOptimistic = () =>
            publishTags([
              node('work', 5),
              { ...node('work/alpha', 2), path: 'work/zeta' },
              node('work/beta', 1),
            ]);
          rollBack = () => {
            publishTags(vocabulary);
            options?.onError?.();
          };
        }
      );
      const user = userEvent.setup();
      await renderAt('/notes');

      await chooseRename(user, 'work/alpha');
      const field = screen.getByRole('textbox');
      await user.clear(field);
      await user.type(field, 'zeta{Enter}');
      expect(triggerFor('work/alpha')).toHaveFocus();

      act(() => applyOptimistic?.());
      expect(triggerFor('work/zeta')).toHaveFocus();

      act(() => rollBack?.());
      expect(triggerFor('work/alpha')).toHaveFocus();
    });

    it('should not pull focus back to the menu when the rename field blurs', async () => {
      const user = userEvent.setup();
      await renderAt('/notes');

      await chooseRename(user, 'personal');
      act(() => screen.getByRole('textbox').blur());

      expect(triggerFor('personal')).not.toHaveFocus();
    });

    it('should keep focus on the tag menu after a recolour', async () => {
      const user = userEvent.setup();
      await renderAt('/notes');

      await openMenuFor(user, 'personal');
      await user.click(
        screen.getByRole('menuitemradio', {
          name: 'organization.tags.colors.purple',
        })
      );
      await settleCloseAutoFocus();

      expect(triggerFor('personal')).toHaveFocus();
    });
  });
});
