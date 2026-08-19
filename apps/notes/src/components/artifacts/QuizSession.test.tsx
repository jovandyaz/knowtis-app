import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuizArtifact } from '@knowtis/shared-types';

import { QuizSession } from './QuizSession';

const mutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useSubmitQuiz: () => ({ mutate, isPending: false }),
}));

const artifact = {
  id: 'quiz-1',
  content: {
    questions: [
      {
        question: '¿Capital de Francia?',
        options: ['Madrid', 'París', 'Roma'],
        correctIndex: 1,
        explanation: 'París es la capital.',
      },
    ],
  },
} as unknown as QuizArtifact;

describe('QuizSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the answers as a radio group named by the question', () => {
    render(<QuizSession artifact={artifact} />);

    expect(
      screen.getByRole('radiogroup', { name: '¿Capital de Francia?' })
    ).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('marks the picked answer as checked once answered', async () => {
    render(<QuizSession artifact={artifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /París/ }));

    expect(screen.getByRole('radio', { name: /París/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /Madrid/ })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});
