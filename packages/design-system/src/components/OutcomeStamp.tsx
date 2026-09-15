import { forwardRef } from 'react';

import { cva } from 'class-variance-authority';

import { cn } from '../utils/cn';

export type OutcomeStampVerdict = 'correct' | 'wrong' | 'skipped';

export interface OutcomeStampProps {
  verdict: OutcomeStampVerdict;
  label: string;
}

const GLYPH: Record<OutcomeStampVerdict, string> = {
  correct: '✓',
  wrong: '✗',
  skipped: '↷',
};

const stampVariants = cva(
  'absolute right-6 top-6 pointer-events-none font-mono text-2xl font-medium leading-none',
  {
    variants: {
      verdict: {
        correct: 'text-learn-correct-text',
        wrong: 'text-learn-incorrect-text',
        skipped: 'text-learn-skipped-text',
      },
    },
  }
);

const OutcomeStamp = forwardRef<HTMLSpanElement, OutcomeStampProps>(
  ({ verdict, label }, ref) => (
    <span ref={ref} className={cn(stampVariants({ verdict }))}>
      <span aria-hidden="true">{GLYPH[verdict]}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
);
OutcomeStamp.displayName = 'OutcomeStamp';

export { OutcomeStamp };
