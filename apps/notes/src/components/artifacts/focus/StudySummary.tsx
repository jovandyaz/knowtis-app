import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SegmentedProgress, type SegmentState } from '@knowtis/design-system';

import { SessionCelebration } from './SessionCelebration';

export interface StudySummaryProps {
  headline: string;
  duration?: string;
  segments: readonly SegmentState[];
  legend: ReadonlyArray<{
    state: Exclude<SegmentState, 'pending' | 'current'>;
    label: string;
    count: number;
  }>;
  celebrate: boolean;
  revisit?: ReactNode;
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
}

const LEGEND_DOT_CLASS: Record<
  Exclude<SegmentState, 'pending' | 'current'>,
  string
> = {
  correct: 'bg-learn-correct',
  wrong: 'bg-learn-incorrect',
  skipped: 'bg-learn-skipped',
};

export function StudySummary({
  headline,
  duration,
  segments,
  legend,
  celebrate,
  revisit,
  primaryAction,
  secondaryAction,
}: StudySummaryProps) {
  const { t } = useTranslation('notes');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);

  return (
    <div className="my-auto flex w-full min-w-0 flex-col gap-6 py-4">
      {celebrate ? <SessionCelebration /> : null}

      <div className="flex flex-col items-center gap-1 text-center">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="rounded-sm font-sans text-3xl leading-tight font-semibold tracking-tight tabular-nums outline-none"
        >
          {headline}
        </h2>
        {duration ? (
          <p className="font-mono text-xs leading-5 font-normal tabular-nums text-(--muted-foreground)">
            {t('ai.artifacts.flashcards.summary.inTime', { duration })}
          </p>
        ) : null}
      </div>

      <SegmentedProgress segments={segments} label={headline} size="hero" />

      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 font-mono text-xs leading-5 font-normal tabular-nums text-(--muted-foreground)">
        {legend.map((item) => (
          <li key={item.state} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${LEGEND_DOT_CLASS[item.state]}`}
            />
            <span>
              {item.count} {item.label}
            </span>
          </li>
        ))}
      </ul>

      {revisit}

      <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
        <div className="min-w-0 flex-1">{primaryAction}</div>
        {secondaryAction}
      </div>
    </div>
  );
}
