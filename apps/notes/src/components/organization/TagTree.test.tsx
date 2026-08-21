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

vi.mock('@knowtis/data-access-notes', () => ({
  useTags: () => ({ data: tagTree() }),
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
  return result;
}

const rowFor = (label: string) => screen.getByText(label).closest('a');

describe('TagTree', () => {
  beforeEach(() => {
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
});
