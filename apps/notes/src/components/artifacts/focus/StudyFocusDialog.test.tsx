import type { ReactNode } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { STUDY_FOCUS_ATTRIBUTE } from './study-focus-marker';
import { STUDY_TOOL, StudyFocusDialog } from './StudyFocusDialog';
import { StudyKeyHints } from './StudyKeyHints';

const { blocker, useBlocker } = vi.hoisted(() => ({
  blocker: { status: 'idle', proceed: vi.fn(), reset: vi.fn() },
  useBlocker: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({ useBlocker }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

const onClose = vi.fn();

function studyTree(inProgress: boolean, stage: ReactNode = <p>stage</p>) {
  return (
    <TooltipProvider>
      <StudyFocusDialog
        tool={STUDY_TOOL.FLASHCARDS}
        title="Photosynthesis"
        progress={{
          segments: [
            'correct',
            'wrong',
            'skipped',
            'current',
            ...Array<'pending'>(8).fill('pending'),
          ],
          label: '3 of 12 answered',
        }}
        inProgress={inProgress}
        onClose={onClose}
      >
        {stage}
      </StudyFocusDialog>
    </TooltipProvider>
  );
}

function renderDialog(inProgress: boolean) {
  return render(studyTree(inProgress));
}

function dropFocus() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

const settleCloseAutoFocus = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  vi.clearAllMocks();
  blocker.status = 'idle';
  useBlocker.mockReturnValue(blocker);
});

describe('StudyFocusDialog', () => {
  it('lets the header shrink around a truncated title', () => {
    renderDialog(false);
    expect(screen.getByRole('banner')).toHaveClass('min-w-0');
  });

  it.each([false, true])(
    'enables navigation blocking only with progress: %s',
    (inProgress) => {
      renderDialog(inProgress);
      expect(useBlocker).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: !inProgress,
          withResolver: true,
        })
      );
      expect(useBlocker.mock.calls.at(-1)?.[0].shouldBlockFn()).toBe(
        inProgress
      );
    }
  );

  it('resets blocked navigation when Keep studying is chosen', async () => {
    blocker.status = 'blocked';
    renderDialog(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.keep' })
    );
    expect(blocker.reset).toHaveBeenCalledTimes(1);
    expect(blocker.proceed).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('proceeds with blocked Back navigation and hides its confirmation when the session completes', () => {
    blocker.status = 'blocked';
    const { rerender } = renderDialog(true);
    expect(
      screen.getByRole('dialog', { name: 'ai.artifacts.focus.exit.title' })
    ).toBeInTheDocument();
    expect(blocker.reset).not.toHaveBeenCalled();
    rerender(
      <TooltipProvider>
        <StudyFocusDialog
          tool={STUDY_TOOL.FLASHCARDS}
          title="Photosynthesis"
          progress={{
            segments: Array<'correct'>(12).fill('correct'),
            label: '12 of 12 answered',
          }}
          inProgress={false}
          onClose={onClose}
        >
          <p>stage</p>
        </StudyFocusDialog>
      </TooltipProvider>
    );
    expect(blocker.proceed).toHaveBeenCalledTimes(1);
    expect(blocker.reset).not.toHaveBeenCalled();
    expect(
      screen.queryByText('ai.artifacts.focus.exit.title')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('proceeds with the latest blocked navigation when the dialog unmounts', () => {
    const { rerender, unmount } = renderDialog(true);
    const pendingBlocker = {
      status: 'blocked',
      proceed: vi.fn(),
      reset: vi.fn(),
    };
    useBlocker.mockReturnValue(pendingBlocker);
    rerender(
      <TooltipProvider>
        <StudyFocusDialog
          tool={STUDY_TOOL.FLASHCARDS}
          title="Photosynthesis"
          progress={{
            segments: [
              'correct',
              'wrong',
              'skipped',
              'current',
              ...Array<'pending'>(8).fill('pending'),
            ],
            label: '3 of 12 answered',
          }}
          inProgress
          onClose={onClose}
        >
          <p>stage</p>
        </StudyFocusDialog>
      </TooltipProvider>
    );
    expect(pendingBlocker.proceed).not.toHaveBeenCalled();
    unmount();
    expect(pendingBlocker.proceed).toHaveBeenCalledTimes(1);
    expect(pendingBlocker.reset).not.toHaveBeenCalled();
  });

  it('keeps the router default native unload warning while a session is in progress', () => {
    renderDialog(true);
    expect(useBlocker.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'enableBeforeUnload'
    );
  });

  it('proceeds with blocked navigation when Leave study is chosen', async () => {
    blocker.status = 'blocked';
    renderDialog(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.leave' })
    );
    expect(blocker.proceed).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not block the URL change after an explicit confirmed exit', async () => {
    renderDialog(true);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.leave' })
    );
    expect(useBlocker.mock.calls.at(-1)?.[0].shouldBlockFn()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps actions in the footer outside the scrolling stage without hints', () => {
    render(
      <StudyFocusDialog
        tool={STUDY_TOOL.QUIZ}
        title="Quiz"
        progress={{ segments: ['current', 'pending'], label: '0 of 2' }}
        inProgress={false}
        onClose={onClose}
        actions={<button>Check</button>}
      >
        <p>Prompt</p>
      </StudyFocusDialog>
    );
    const footer = screen.getByRole('contentinfo');
    expect(footer).toContainElement(
      screen.getByRole('button', { name: 'Check' })
    );
    expect(document.activeElement).toContainElement(screen.getByText('Prompt'));
    expect(document.activeElement).not.toContainElement(footer);
  });
  it('names the dialog after the tool and title and marks it as the focus overlay', () => {
    renderDialog(false);
    const dialog = screen.getByRole('dialog', {
      name: 'ai.artifacts.focus.dialogTitle {"tool":"ai.artifacts.types.flashcards","title":"Photosynthesis"}',
    });
    expect(dialog).toHaveAttribute(STUDY_FOCUS_ATTRIBUTE);
    expect(
      screen.getByRole('progressbar', { name: '3 of 12 answered' })
    ).toBeInTheDocument();
    expect(screen.queryByText('3 of 12 answered')).not.toBeInTheDocument();
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

  it('returns focus to the stage when Keep studying answers a blocked navigation', async () => {
    blocker.status = 'blocked';
    blocker.reset.mockImplementation(() => {
      blocker.status = 'idle';
    });
    const { rerender } = renderDialog(true);

    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.keep' })
    );
    rerender(studyTree(true));

    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(document.activeElement).toContainElement(screen.getByText('stage'));
  });

  it('returns focus to the stage when Escape dismisses the confirmation after focus was dropped', async () => {
    renderDialog(true);
    dropFocus();
    await userEvent.keyboard('{Escape}');

    await userEvent.keyboard('{Escape}');

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(screen.getByText('stage'));
  });

  it('returns focus to the card the stage is showing rather than to the stage itself', async () => {
    render(
      studyTree(
        true,
        <>
          <p>stage</p>
          <button type="button">card</button>
        </>
      )
    );
    dropFocus();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.keep' })
    );

    expect(screen.getByRole('button', { name: 'card' })).toHaveFocus();
  });

  it.each<{
    opener: string;
    openConfirmation: (rerender: (ui: ReactNode) => void) => Promise<void>;
  }>([
    {
      opener: 'Escape',
      openConfirmation: async () => {
        await userEvent.keyboard('{Escape}');
      },
    },
    {
      opener: 'a blocked Back navigation',
      openConfirmation: async (rerender) => {
        blocker.status = 'blocked';
        rerender(studyTree(true));
      },
    },
  ])(
    'keeps focus off the stage when the session completes during a confirmation opened by $opener',
    async ({ openConfirmation }) => {
      const { rerender } = renderDialog(true);
      const stage = screen.getByText('stage').closest('[tabindex="-1"]');
      dropFocus();
      await openConfirmation(rerender);
      expect(
        screen.getByRole('dialog', { name: 'ai.artifacts.focus.exit.title' })
      ).toBeInTheDocument();

      rerender(studyTree(false));
      await settleCloseAutoFocus();

      expect(
        screen.queryByText('ai.artifacts.focus.exit.title')
      ).not.toBeInTheDocument();
      expect(stage).not.toHaveFocus();
    }
  );

  it('leaves focus to the exit path when the user confirms leaving', async () => {
    renderDialog(true);
    const stage = screen.getByText('stage').closest('[tabindex="-1"]');
    dropFocus();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.leave' })
    );
    await settleCloseAutoFocus();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stage).not.toHaveFocus();
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

  it('Escape while the confirmation is open dismisses only the confirmation', async () => {
    renderDialog(true);
    const dialog = screen.getByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(
      screen.getByRole('dialog', { name: 'ai.artifacts.focus.exit.title' })
    ).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(
      screen.queryByText('ai.artifacts.focus.exit.title')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the confirmation is gone after leaving', async () => {
    renderDialog(true);
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exitStudy' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exit.leave' })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('ai.artifacts.focus.exit.title')
    ).not.toBeInTheDocument();
  });

  it('clears the confirmation when the session finishes', async () => {
    const { rerender } = renderDialog(true);
    await userEvent.keyboard('{Escape}');
    expect(
      screen.getByRole('dialog', { name: 'ai.artifacts.focus.exit.title' })
    ).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <StudyFocusDialog
          tool={STUDY_TOOL.FLASHCARDS}
          title="Photosynthesis"
          progress={{
            segments: Array<'correct'>(12).fill('correct'),
            label: '12 of 12 answered',
          }}
          inProgress={false}
          onClose={onClose}
        >
          <p>stage</p>
        </StudyFocusDialog>
      </TooltipProvider>
    );

    expect(
      screen.queryByText('ai.artifacts.focus.exit.title')
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps key hints in a footer outside the scrolling stage', () => {
    render(
      <TooltipProvider>
        <StudyFocusDialog
          tool={STUDY_TOOL.FLASHCARDS}
          title="Photosynthesis"
          progress={{
            segments: [
              'correct',
              'wrong',
              'skipped',
              'current',
              ...Array<'pending'>(8).fill('pending'),
            ],
            label: '3 of 12 answered',
          }}
          inProgress={false}
          onClose={onClose}
          hints={
            <StudyKeyHints hints={[{ keys: ['Space'], label: 'Flip card' }]} />
          }
        >
          <p>stage</p>
        </StudyFocusDialog>
      </TooltipProvider>
    );

    const footer = screen.getByRole('contentinfo');
    expect(footer).toContainElement(screen.getByText('Flip card'));
    expect(footer.parentElement).toBe(screen.getByRole('dialog'));
    expect(document.activeElement).toContainElement(screen.getByText('stage'));
    expect(document.activeElement).not.toContainElement(footer);
  });

  it('keeps the title header clear and places the segmented history immediately below it', () => {
    render(
      <StudyFocusDialog
        tool={STUDY_TOOL.FLASHCARDS}
        title="Photosynthesis"
        progress={{
          segments: ['correct', 'wrong', 'current'],
          label: '2 of 3 answered',
        }}
        inProgress
        onClose={onClose}
      >
        <p>stage</p>
      </StudyFocusDialog>
    );
    const header = screen.getByRole('banner');
    const track = screen.getByRole('progressbar', { name: '2 of 3 answered' });
    expect(header).not.toContainElement(track);
    expect(header.nextElementSibling).toBe(track);
    expect(track).toHaveAttribute('aria-valuenow', '2');
    expect(track).toHaveAttribute('aria-valuemax', '3');
    expect(header).not.toHaveTextContent('2 of 3 answered');
  });
});
