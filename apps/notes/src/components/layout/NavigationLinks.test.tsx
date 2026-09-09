import type { ReactNode } from 'react';

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
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    onClick,
  }: {
    to: string;
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
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

describe('NavigationLinks', () => {
  it('shows the review item, labelled from common.json, when the flag is on', () => {
    isStudyEnabled = true;

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(screen.getByRole('link', { name: /labels\.study/ })).toHaveAttribute(
      'href',
      '/study'
    );
  });

  it('hides the review item when the flag is off', () => {
    isStudyEnabled = false;

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(
      screen.queryByRole('link', { name: /labels\.study/ })
    ).not.toBeInTheDocument();
  });

  it('renders no review item, not even a placeholder, while the flag is still loading', () => {
    flagsQuery = { isPending: true, isError: false };
    isStudyEnabled = false;

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(
      screen.queryByRole('link', { name: /labels\.study/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('navigation').children).toHaveLength(
      NAVIGATION_LINKS.filter((link) => link.to !== ROUTES.STUDY).length
    );
  });

  it('asks for no study stats while the flag is off', () => {
    isStudyEnabled = false;

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: false,
    });
  });

  it('asks for no study stats until the flags have settled', () => {
    flagsQuery = { isPending: true, isError: false };
    isStudyEnabled = true;

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: false,
    });
  });

  it('asks for the study stats once the flag is on', () => {
    isStudyEnabled = true;

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: true,
    });
  });

  it('shows the due count on the review item', () => {
    isStudyEnabled = true;
    statsQuery = {
      data: makeStats({ dueCount: 7 }),
      isPending: false,
      isError: false,
    };

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(
      screen.getByRole('link', { name: /labels\.study/ })
    ).toHaveTextContent('7');
  });

  it('names the due count instead of leaving a bare number', () => {
    isStudyEnabled = true;
    statsQuery = {
      data: makeStats({ dueCount: 7 }),
      isPending: false,
      isError: false,
    };

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(
      screen.getByRole('link', { name: /labels\.studyDueCount/ })
    ).toBeInTheDocument();
    expect(screen.getByText('labels.studyDueCount {"count":7}')).toHaveClass(
      'sr-only'
    );
    expect(screen.getByText('7')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders no badge when nothing is due', () => {
    isStudyEnabled = true;
    statsQuery = {
      data: makeStats({ dueCount: 0 }),
      isPending: false,
      isError: false,
    };

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(
      screen.getByRole('link', { name: /labels\.study/ })
    ).toHaveTextContent('labels.study');
    expect(
      screen.getByRole('link', { name: /labels\.study/ }).textContent
    ).toBe('labels.study');
  });

  it('ignores new cards for the badge, counting only what is due', () => {
    isStudyEnabled = true;
    statsQuery = {
      data: makeStats({ dueCount: 0, newCount: 9 }),
      isPending: false,
      isError: false,
    };

    render(<NavigationLinks links={NAVIGATION_LINKS} />);

    expect(
      screen.getByRole('link', { name: /labels\.study/ }).textContent
    ).toBe('labels.study');
  });
});
