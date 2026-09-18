import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';

import { NAVIGATION_LINKS } from '@/config/navigation.config';
import { ROUTES } from '@/config/routes.config';
import { BROWSER_TIME_ZONE } from '@/lib/browser-time-zone';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudyStats } from '@knowtis/shared-types';

import { NavigationLinks } from './NavigationLinks';

const { studyStatsSpy } = vi.hoisted(() => ({ studyStatsSpy: vi.fn() }));

let flagsQuery: { isPending: boolean; isError: boolean };
let isStudyEnabled: boolean;
let statsQuery: {
  data: StudyStats | undefined;
  isPending: boolean;
  isError: boolean;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
  }),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlags: () => flagsQuery,
  useFeatureFlag: () => isStudyEnabled,
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useStudyStats: (timeZone: string, options?: { enabled?: boolean }) => {
    studyStatsSpy(timeZone, options);
    return statsQuery;
  },
}));

function makeStats(overrides: Partial<StudyStats> = {}): StudyStats {
  return {
    dueCount: 0,
    newCount: 0,
    reviewedToday: 0,
    currentStreak: 0,
    totalCardsStudied: 0,
    nextDueAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  studyStatsSpy.mockClear();
  flagsQuery = { isPending: false, isError: false };
  isStudyEnabled = false;
  statsQuery = { data: makeStats(), isPending: false, isError: false };
});

async function renderNavigation(path = '/dashboard', links = NAVIGATION_LINKS) {
  const rootRoute = createRootRoute({
    component: () => <NavigationLinks links={links} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/dashboard' }),
      createRoute({ getParentRoute: () => rootRoute, path: '/study' }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('navigation');
}

describe('NavigationLinks', () => {
  it('aligns primary links on the shared icon rail with a taller row', async () => {
    isStudyEnabled = true;
    await renderNavigation();

    expect(screen.getByRole('navigation')).toHaveClass('px-3');
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass(
        'min-h-9',
        'px-2',
        'gap-2',
        'rounded-md',
        'pointer-coarse:min-h-11'
      );
      expect(link.firstElementChild).toHaveClass('w-4', 'shrink-0');
    }
  });

  it('preserves route selection with the shared active and idle treatment', async () => {
    isStudyEnabled = true;
    await renderNavigation('/study');

    expect(screen.getByRole('link', { name: 'labels.study' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      screen.getByRole('link', { name: 'labels.home' })
    ).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'labels.home' })).toHaveClass(
      'text-foreground',
      'dark:text-muted-foreground',
      'hover:text-primary'
    );
  });

  it('shows the review item, labelled from common.json, when the flag is on', async () => {
    isStudyEnabled = true;

    await renderNavigation();

    expect(screen.getByRole('link', { name: /labels\.study/ })).toHaveAttribute(
      'href',
      '/study'
    );
  });

  it('hides the review item when the flag is off', async () => {
    isStudyEnabled = false;

    await renderNavigation();

    expect(
      screen.queryByRole('link', { name: /labels\.study/ })
    ).not.toBeInTheDocument();
  });

  it('renders no review item, not even a placeholder, while the flag is still loading', async () => {
    flagsQuery = { isPending: true, isError: false };
    isStudyEnabled = false;

    await renderNavigation();

    expect(
      screen.queryByRole('link', { name: /labels\.study/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('navigation').children).toHaveLength(
      NAVIGATION_LINKS.filter((link) => link.to !== ROUTES.STUDY).length
    );
  });

  it('asks for no study stats while the flag is off', async () => {
    isStudyEnabled = false;

    await renderNavigation();

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: false,
    });
  });

  it('asks for no study stats until the flags have settled', async () => {
    flagsQuery = { isPending: true, isError: false };
    isStudyEnabled = true;

    await renderNavigation();

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: false,
    });
  });

  it('asks for the study stats once the flag is on', async () => {
    isStudyEnabled = true;

    await renderNavigation();

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: true,
    });
  });

  it('shows the due count on the review item', async () => {
    isStudyEnabled = true;
    statsQuery = {
      data: makeStats({ dueCount: 7 }),
      isPending: false,
      isError: false,
    };

    await renderNavigation();

    expect(
      screen.getByRole('link', { name: /labels\.study/ })
    ).toHaveTextContent('7');
  });

  it('names the due count instead of leaving a bare number', async () => {
    isStudyEnabled = true;
    statsQuery = {
      data: makeStats({ dueCount: 7 }),
      isPending: false,
      isError: false,
    };

    await renderNavigation();

    expect(
      screen.getByRole('link', { name: /labels\.studyDueCount/ })
    ).toBeInTheDocument();
    expect(screen.getByText('labels.studyDueCount {"count":7}')).toHaveClass(
      'sr-only'
    );
    expect(screen.getByText('7')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders no badge when nothing is due', async () => {
    isStudyEnabled = true;
    statsQuery = {
      data: makeStats({ dueCount: 0 }),
      isPending: false,
      isError: false,
    };

    await renderNavigation();

    expect(
      screen.getByRole('link', { name: /labels\.study/ })
    ).toHaveTextContent('labels.study');
    expect(
      screen.getByRole('link', { name: /labels\.study/ }).textContent
    ).toBe('labels.study');
  });

  it('ignores new cards for the badge, counting only what is due', async () => {
    isStudyEnabled = true;
    statsQuery = {
      data: makeStats({ dueCount: 0, newCount: 9 }),
      isPending: false,
      isError: false,
    };

    await renderNavigation();

    expect(
      screen.getByRole('link', { name: /labels\.study/ }).textContent
    ).toBe('labels.study');
  });
});
