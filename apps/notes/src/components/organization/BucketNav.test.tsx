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

import type { NoteBucketCounts } from '@knowtis/shared-types';

import { BucketNav } from './BucketNav';
import { NAV_ICON_SLOT, NAV_ROW } from './nav-row.styles';

const noteCounts = vi.fn<() => NoteBucketCounts | undefined>();

vi.mock('@knowtis/data-access-notes', () => ({
  useNoteCounts: () => ({ data: noteCounts() }),
  useTags: () => ({ data: [] }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'organization.title': 'Organización',
        'organization.buckets.inbox': 'Inbox',
        'organization.buckets.projects': 'Proyectos',
        'organization.buckets.areas': 'Áreas',
        'organization.buckets.resources': 'Recursos',
        'organization.buckets.archive': 'Archivo',
      })[key] ?? key,
  }),
}));

async function renderAt(path: string, onNavigate?: () => void) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <BucketNav {...(onNavigate ? { onNavigate } : {})} />
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
  await screen.findByText('Organización');
  return result;
}

const rowFor = (label: string) => screen.getByText(label).closest('a');

describe('BucketNav', () => {
  beforeEach(() => {
    noteCounts.mockReturnValue({
      inbox: 7,
      projects: 3,
      areas: 0,
      resources: 2,
      archive: 5,
    });
  });

  it('renders the buckets in PARA order under the section title', async () => {
    await renderAt('/notes');

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Inbox7', 'Proyectos3', 'Áreas', 'Recursos2', 'Archivo']
    );
  });

  it('links each row to its bucket filter on the notes list', async () => {
    await renderAt('/notes');

    expect(rowFor('Proyectos')).toHaveAttribute(
      'href',
      '/notes?bucket=projects&view=all'
    );
  });

  it('shows counts for filled buckets, never for archive', async () => {
    await renderAt('/notes');

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(rowFor('Archivo')).not.toHaveTextContent(/\d/);
    expect(rowFor('Áreas')).not.toHaveTextContent(/\d/);
  });

  it('renders no counts while they are still loading', async () => {
    noteCounts.mockReturnValue(undefined);

    await renderAt('/notes');

    expect(rowFor('Inbox')).not.toHaveTextContent(/\d/);
  });

  it('marks the bucket from the URL as the current page', async () => {
    await renderAt('/notes?bucket=projects&view=all');

    expect(rowFor('Proyectos')).toHaveAttribute('aria-current', 'page');
    expect(rowFor('Inbox')).not.toHaveAttribute('aria-current');
  });

  it('keeps the bucket current when the view filter is not the default', async () => {
    await renderAt('/notes?bucket=projects&view=mine');

    expect(rowFor('Proyectos')).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the bucket current when the URL carries no view param', async () => {
    await renderAt('/notes?bucket=projects');

    expect(rowFor('Proyectos')).toHaveAttribute('aria-current', 'page');
  });

  it('renders the same row markup regardless of whether the URL is the canonical one', async () => {
    const canonical = await renderAt('/notes?bucket=projects&view=all');
    const canonicalClassName = rowFor('Proyectos')?.className;
    canonical.unmount();

    await renderAt('/notes?bucket=projects&view=mine');
    const nonCanonicalClassName = rowFor('Proyectos')?.className;

    expect(nonCanonicalClassName).toBe(canonicalClassName);
    expect(canonicalClassName).toContain('bg-muted');
  });

  it('marks no bucket current while a note is open with a stale bucket param', async () => {
    await renderAt('/notes/note-1?bucket=projects&view=all');

    expect(rowFor('Proyectos')).not.toHaveAttribute('aria-current');
  });

  it('notifies the host when a bucket is picked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    await renderAt('/notes', onNavigate);
    await user.click(screen.getByText('Recursos'));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
  it('should sit on the rail every organization list shares', async () => {
    await renderAt('/notes');

    const row = rowFor('Proyectos');

    expect(row).toHaveClass(...NAV_ROW.split(' '));
    expect(row?.firstElementChild).toHaveClass(...NAV_ICON_SLOT.split(' '));
  });
});
