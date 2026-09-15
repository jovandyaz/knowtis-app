import { render, screen } from '@testing-library/react';
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

function renderDialog(inProgress: boolean) {
  return render(
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
          progress={{ value: 12, max: 12, label: '12 of 12 completed' }}
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
          progress={{ value: 3, max: 12, label: '3 of 12 completed' }}
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
        progress={{ value: 0, max: 2, label: '0 of 2' }}
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
          progress={{ value: 12, max: 12, label: '12 of 12 completed' }}
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
          progress={{ value: 3, max: 12, label: '3 of 12 completed' }}
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
});
