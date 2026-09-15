import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OutcomeStamp, type OutcomeStampVerdict } from './OutcomeStamp';

const cases: ReadonlyArray<[OutcomeStampVerdict, string, string, string]> = [
  ['correct', 'Recalled', '✓', 'text-learn-correct-text'],
  ['wrong', 'Needs practice', '✗', 'text-learn-incorrect-text'],
  ['skipped', 'Skipped', '↷', 'text-learn-skipped-text'],
];

describe('OutcomeStamp', () => {
  it.each(cases)(
    'gives %s a text equivalent and a verdict tint',
    (verdict, label, glyph, tone) => {
      const ref = createRef<HTMLSpanElement>();
      render(<OutcomeStamp ref={ref} verdict={verdict} label={label} />);
      expect(screen.getByText(label)).toHaveClass('sr-only');
      expect(screen.getByText(glyph)).toHaveAttribute('aria-hidden', 'true');
      expect(ref.current).toHaveClass('absolute', 'font-mono', tone);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );
});
