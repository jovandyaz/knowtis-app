import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteSupertagCounts } from '@knowtis/shared-types';

import { NAV_ICON_SLOT, NAV_ROW } from './nav-row.styles';
import { SupertagNav } from './SupertagNav';

const supertagCounts = vi.fn<() => NoteSupertagCounts | undefined>();

vi.mock('@knowtis/data-access-notes', () => ({
  useNoteCounts: () => ({ data: { supertags: supertagCounts() } }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const noCounts: NoteSupertagCounts = {
  person: 0,
  book: 0,
  project: 0,
  meeting: 0,
  idea: 0,
};

async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <SupertagNav />
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
  await screen.findByText('organization.typesTitle');
  return result;
}

const rowFor = (key: string) => screen.getByText(key).closest('a');

describe('SupertagNav', () => {
  beforeEach(() => {
    supertagCounts.mockReturnValue({ ...noCounts, person: 3, meeting: 1 });
  });

  it('should render nothing while no type is in use', () => {
    supertagCounts.mockReturnValue(noCounts);
    const rootRoute = createRootRoute({ component: () => <SupertagNav /> });
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/notes'] }),
    });

    render(<RouterProvider router={router} />);

    expect(
      screen.queryByText('organization.typesTitle')
    ).not.toBeInTheDocument();
  });

  it('should list only the types that have notes', async () => {
    await renderAt('/notes');

    expect(
      screen.getByText('organization.supertags.names.person')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('organization.supertags.names.book')
    ).not.toBeInTheDocument();
  });

  it('should link a type to the list filtered by it', async () => {
    await renderAt('/notes');

    expect(rowFor('organization.supertags.names.person')).toHaveAttribute(
      'href',
      expect.stringContaining('supertag=person')
    );
  });

  // The schema's defaults never reach location.search, so Link's own active
  // matching would miss here — the same trap that broke the F1 bucket highlight.
  it('should mark only the type named in the url as current', async () => {
    await renderAt('/notes?supertag=person');

    expect(rowFor('organization.supertags.names.person')).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(rowFor('organization.supertags.names.meeting')).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('should show the count the server reports', async () => {
    await renderAt('/notes');

    expect(rowFor('organization.supertags.names.person')).toHaveTextContent(
      '3'
    );
  });
  it('should sit on the rail every organization list shares', async () => {
    await renderAt('/notes');

    const row = rowFor('organization.supertags.names.person');

    expect(row).toHaveClass(...NAV_ROW.split(' '));
    expect(row?.firstElementChild).toHaveClass(...NAV_ICON_SLOT.split(' '));
  });
});
