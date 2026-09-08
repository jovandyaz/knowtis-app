import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cva } from 'class-variance-authority';
import { Check, X } from 'lucide-react';

import {
  answerLetter,
  type AnswerOptionState,
  type AnswerOutcome,
} from '../constants/answer-option';
import { cn } from '../utils';

const optionVariants = cva(
  'flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 disabled:pointer-events-none',
  {
    variants: {
      state: {
        idle: 'border-(--border) bg-(--card) hover:bg-(--accent)',
        selected: 'border-(--primary) bg-(--primary)/10',
        correct: 'border-learn-correct bg-learn-correct/10',
        incorrect: 'border-learn-incorrect bg-learn-incorrect/10',
      },
    },
  }
);

export interface AnswerOptionProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'type' | 'role' | 'aria-checked' | 'children' | 'onSelect'
> {
  /** Zero-based position in the group, 0-25; renders as the letter A-Z. */
  index: number;
  children: ReactNode;
  /** The answer the user picked. Drives `aria-checked` on its own. */
  selected?: boolean | undefined;
  /** Revealed grading. Drives the icon and the tone, never the checked state. */
  outcome?: AnswerOutcome | undefined;
  onSelect?: () => void;
}

function StateIcon({ state }: { state: AnswerOptionState }) {
  if (state === 'correct') {
    return (
      <Check
        aria-hidden="true"
        className="size-4 shrink-0 text-learn-correct"
      />
    );
  }
  if (state === 'incorrect') {
    return (
      <X aria-hidden="true" className="size-4 shrink-0 text-learn-incorrect" />
    );
  }
  return null;
}

/**
 * One answer row of a quiz, meant to live inside a `radiogroup` the consumer
 * owns: that group holds the roving `tabIndex` and arrow-key movement of the
 * APG radio group pattern, and announces the graded result. Only `selected`
 * drives `aria-checked`, so revealing the right answer with `outcome` on an
 * unpicked row never adds a second checked radio.
 */
const AnswerOption = forwardRef<HTMLButtonElement, AnswerOptionProps>(
  (
    {
      index,
      children,
      selected = false,
      outcome,
      onSelect,
      className,
      ...rest
    },
    ref
  ) => {
    const state: AnswerOptionState =
      outcome ?? (selected ? 'selected' : 'idle');
    const letter = answerLetter(index);
    return (
      <button
        ref={ref}
        {...rest}
        type="button"
        role="radio"
        aria-checked={selected}
        data-state={state}
        onClick={onSelect}
        className={cn(optionVariants({ state }), className)}
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--muted) text-xs font-semibold"
        >
          {letter}
        </span>
        <span className="sr-only">{letter}.</span>
        <span className="flex-1">{children}</span>
        <StateIcon state={state} />
      </button>
    );
  }
);
AnswerOption.displayName = 'AnswerOption';

export { AnswerOption };
