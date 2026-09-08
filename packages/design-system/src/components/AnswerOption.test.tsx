import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnswerOption } from './AnswerOption';

describe('AnswerOption', () => {
  it('selects on click and exposes the radio state', () => {
    const onSelect = vi.fn();
    render(
      <AnswerOption index={0} onSelect={onSelect}>
        Paris
      </AnswerOption>
    );
    const option = screen.getByRole('radio', { name: /^A\.\s*Paris$/ });
    expect(option).toHaveAttribute('aria-checked', 'false');
    expect(option).toHaveAttribute('data-state', 'idle');
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('marks a revealed correct answer without checking it', () => {
    render(
      <AnswerOption index={1} outcome="correct">
        Lyon
      </AnswerOption>
    );
    const option = screen.getByRole('radio', { name: /^B\.\s*Lyon$/ });
    expect(option).toHaveAttribute('aria-checked', 'false');
    expect(option).toHaveAttribute('data-state', 'correct');
    expect(option.className).toContain('border-learn-correct');
    expect(option.querySelector('svg')).not.toBeNull();
  });

  it('checks the picked answer and keeps its outcome tone', () => {
    render(
      <AnswerOption index={1} selected outcome="correct">
        Lyon
      </AnswerOption>
    );
    const option = screen.getByRole('radio', { name: /^B\.\s*Lyon$/ });
    expect(option).toHaveAttribute('aria-checked', 'true');
    expect(option).toHaveAttribute('data-state', 'correct');
  });

  it('checks a pick that has no outcome yet', () => {
    render(
      <AnswerOption index={3} selected>
        Nice
      </AnswerOption>
    );
    const option = screen.getByRole('radio', { name: /^D\.\s*Nice$/ });
    expect(option).toHaveAttribute('aria-checked', 'true');
    expect(option).toHaveAttribute('data-state', 'selected');
    expect(option.querySelector('svg')).toBeNull();
  });

  it('cannot be selected while disabled', () => {
    const onSelect = vi.fn();
    render(
      <AnswerOption
        index={2}
        selected
        outcome="incorrect"
        onSelect={onSelect}
        disabled
      >
        Rome
      </AnswerOption>
    );
    const option = screen.getByRole('radio', { name: /^C\.\s*Rome$/ });
    expect(option).toBeDisabled();
    expect(option.className).toContain('border-learn-incorrect');
    fireEvent.click(option);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('forwards rest props like id to the button', () => {
    render(
      <AnswerOption index={0} id="answer-a">
        Paris
      </AnswerOption>
    );
    expect(screen.getByRole('radio')).toHaveAttribute('id', 'answer-a');
  });
});
