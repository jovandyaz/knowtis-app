import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { STUDY_FOCUS_ATTRIBUTE } from './study-focus-marker';
import { STUDY_TOOL, StudyFocusDialog } from './StudyFocusDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

const onClose = vi.fn();

function renderDialog(inProgress: boolean) {
  render(
    <TooltipProvider>
      <StudyFocusDialog
        tool={STUDY_TOOL.FLASHCARDS}
        title="Photosynthesis"
        progress={{ value: 3, max: 12, label: '3 of 12 completed' }}
        inProgress={inProgress}
        onClose={onClose}
      >
        <p>stage</p>
      </StudyFocusDialog>
    </TooltipProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('StudyFocusDialog', () => {
  it('names the dialog after the tool and title and marks it as the focus overlay', () => {
    renderDialog(false);
    const dialog = screen.getByRole('dialog', {
      name: 'ai.artifacts.focus.dialogTitle {"tool":"ai.artifacts.types.flashcards","title":"Photosynthesis"}',
    });
    expect(dialog).toHaveAttribute(STUDY_FOCUS_ATTRIBUTE);
    expect(screen.getByText('3 of 12 completed')).toBeInTheDocument();
  });

  it('closes directly when nothing is in progress', async () => {
    renderDialog(false);
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exitStudy' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before leaving a session in progress and keeps studying on cancel', async () => {
    renderDialog(true);
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText('ai.artifacts.focus.exit.title')
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.keep' })
    );
    expect(
      screen.queryByText('ai.artifacts.focus.exit.title')
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves once the user confirms', async () => {
    renderDialog(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exitStudy' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.leave' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
