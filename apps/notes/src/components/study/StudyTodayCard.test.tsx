import type { ReactNode } from 'react';

import { BROWSER_TIME_ZONE } from '@/lib/browser-time-zone';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudyStats } from '@knowtis/shared-types';
import { formatRelativeTime } from '@knowtis/shared-util';

import { StudyTodayCard } from './StudyTodayCard';

const { studyStatsSpy } = vi.hoisted(() => ({ studyStatsSpy: vi.fn() }));

let flagsQuery: { isPending: boolean; isError: boolean };
let isQueueEnabled: boolean;
let statsQuery: {
  data: StudyStats | undefined;
  isPending: boolean;
  isError: boolean;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
    i18n: { language: 'es' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlags: () => flagsQuery,
  useFeatureFlag: () => isQueueEnabled,
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useStudyStats: (timeZone: string, options?: { enabled?: boolean }) => {
    studyStatsSpy(timeZone, options);
    return statsQuery;
  },
}));

function makeStats(overrides: Partial<StudyStats> = {}): StudyStats {
  return {
    dueCount: 12,
    newCount: 4,
    reviewedToday: 0,
    currentStreak: 3,
    totalCardsStudied: 40,
    nextDueAt: null,
    ...overrides,
  };
}

const tile = (name: string) => screen.getByRole('group', { name });

beforeEach(() => {
  studyStatsSpy.mockClear();
  flagsQuery = { isPending: false, isError: false };
  isQueueEnabled = true;
  statsQuery = { data: makeStats(), isPending: false, isError: false };
});

describe('StudyTodayCard', () => {
  it("renders today's counts under the tile each one belongs to", () => {
    render(<StudyTodayCard />);

    expect(
      within(tile('study.todayCard.dueLabel')).getByText('12')
    ).toBeInTheDocument();
    expect(
      within(tile('study.todayCard.newLabel {"count":4}')).getByText('4')
    ).toBeInTheDocument();
    expect(
      within(tile('study.todayCard.streakLabel {"count":3}')).getByText('3')
    ).toBeInTheDocument();
  });

  it('shows a loading state while the stats are still loading', () => {
    statsQuery = { data: undefined, isPending: true, isError: false };

    render(<StudyTodayCard />);

    expect(
      screen.getByRole('status', { name: 'study.loading' })
    ).toBeInTheDocument();
  });

  it('shows the caught up state once nothing is left for today', () => {
    const nextDueAt = '2099-01-01T09:00:00.000Z';
    statsQuery = {
      data: makeStats({ dueCount: 0, newCount: 0, nextDueAt }),
      isPending: false,
      isError: false,
    };

    render(<StudyTodayCard />);

    expect(screen.getByText('study.caughtUp.title')).toBeInTheDocument();
    expect(screen.getByText(/study\.caughtUp\.nextReview/)).toHaveTextContent(
      formatRelativeTime(new Date(nextDueAt), 'es')
    );
    expect(screen.queryByText('study.todayCard.dueLabel')).toBeNull();
  });

  it('says nothing is scheduled when there is no next due date', () => {
    statsQuery = {
      data: makeStats({ dueCount: 0, newCount: 0, nextDueAt: null }),
      isPending: false,
      isError: false,
    };

    render(<StudyTodayCard />);

    expect(
      screen.getByText('study.caughtUp.nothingScheduled')
    ).toBeInTheDocument();
  });

  it('offers no review to start once nothing is left for today', () => {
    statsQuery = {
      data: makeStats({ dueCount: 0, newCount: 0 }),
      isPending: false,
      isError: false,
    };

    render(<StudyTodayCard />);

    expect(screen.getByText('study.caughtUp.title')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'study.todayCard.cta' })
    ).toBeNull();
  });

  it('renders nothing when the flag is off', () => {
    isQueueEnabled = false;

    const { container } = render(<StudyTodayCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it('asks for no study stats while the flag is off', () => {
    isQueueEnabled = false;

    render(<StudyTodayCard />);

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: false,
    });
  });

  it('asks for no study stats until the flags have settled', () => {
    flagsQuery = { isPending: true, isError: false };
    isQueueEnabled = true;

    render(<StudyTodayCard />);

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: false,
    });
  });

  it('asks for the study stats once the flag is on', () => {
    isQueueEnabled = true;

    render(<StudyTodayCard />);

    expect(studyStatsSpy).toHaveBeenCalledWith(BROWSER_TIME_ZONE, {
      enabled: true,
    });
  });

  it('links the CTA to the study route', () => {
    render(<StudyTodayCard />);

    expect(
      screen.getByRole('link', { name: 'study.todayCard.cta' })
    ).toHaveAttribute('href', '/study');
  });

  it('shows a loading state instead of hiding the card while the flags are still loading', () => {
    flagsQuery = { isPending: true, isError: false };

    render(<StudyTodayCard />);

    expect(
      screen.getByRole('status', { name: 'study.loading' })
    ).toBeInTheDocument();
  });

  it('never shows the caught up state when the stats query failed', () => {
    statsQuery = { data: undefined, isPending: false, isError: true };

    const { container } = render(<StudyTodayCard />);

    expect(screen.queryByText('study.caughtUp.title')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the flags cannot be read', () => {
    flagsQuery = { isPending: false, isError: true };

    const { container } = render(<StudyTodayCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
