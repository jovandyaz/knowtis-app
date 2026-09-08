import { cva } from 'class-variance-authority';

import type { LearnToneButtonTone } from '../constants/learn-tone';

/**
 * Tinted pill button for the study surfaces, keyed by what the tone means
 * rather than by the rating that uses it. Each variant repeats its text colour
 * under `hover:` because a ghost host (`Button variant="ghost"`) repaints the
 * text on hover and would otherwise win.
 */
export const learnToneButton = cva(
  'ring-1 transition-colors duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      tone: {
        primary:
          'bg-(--primary)/15 text-(--primary) ring-(--primary)/25 hover:bg-(--primary)/25 hover:text-(--primary)',
        correct:
          'bg-learn-correct/15 text-learn-correct-text ring-learn-correct/25 hover:bg-learn-correct/25 hover:text-learn-correct-text',
        incorrect:
          'bg-learn-incorrect/15 text-learn-incorrect-text ring-learn-incorrect/25 hover:bg-learn-incorrect/25 hover:text-learn-incorrect-text',
        muted:
          'bg-(--muted) text-(--foreground) ring-(--border) hover:bg-(--accent) hover:text-(--foreground)',
      } satisfies Record<LearnToneButtonTone, string>,
    },
  }
);
