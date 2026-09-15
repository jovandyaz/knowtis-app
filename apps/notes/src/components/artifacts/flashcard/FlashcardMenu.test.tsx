import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FlashcardMenu } from './FlashcardMenu';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));

function renderMenu(
  overrides: Partial<Parameters<typeof FlashcardMenu>[0]> = {}
) {
  const props = {
    isAdvancedMode: false,
    onToggleAdvanced: vi.fn(),
    onRestart: vi.fn(),
    onShuffle: vi.fn(),
    ...overrides,
  };
  render(<FlashcardMenu {...props} />);
  return props;
}

const trigger = () =>
  screen.getByRole('button', { name: 'ai.artifacts.focus.options' });

describe('FlashcardMenu', () => {
  it('locks restart and shuffle behind a disabled trigger while saving', async () => {
    const props = renderMenu({ disabled: true });
    expect(trigger()).toBeDisabled();
    await userEvent.click(trigger());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(props.onRestart).not.toHaveBeenCalled();
    expect(props.onShuffle).not.toHaveBeenCalled();
  });
  it('names the trigger after the study options and gives it a 48px target', () => {
    renderMenu();

    expect(trigger()).toHaveClass('h-12', 'w-12');
  });

  it('toggles the four recall ratings from a checkbox item', async () => {
    const props = renderMenu();

    await userEvent.click(trigger());
    const toggle = await screen.findByRole('menuitemcheckbox', {
      name: 'ai.artifacts.flashcards.advancedMode',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);

    expect(props.onToggleAdvanced).toHaveBeenCalledTimes(1);
  });

  it('shows the four recall ratings as checked while they are on', async () => {
    renderMenu({ isAdvancedMode: true });

    await userEvent.click(trigger());

    expect(
      await screen.findByRole('menuitemcheckbox', {
        name: 'ai.artifacts.flashcards.advancedMode',
      })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('shuffles the remaining cards from the menu', async () => {
    const props = renderMenu();

    await userEvent.click(trigger());
    await userEvent.click(
      await screen.findByRole('menuitem', {
        name: 'ai.artifacts.flashcards.shuffle',
      })
    );

    expect(props.onShuffle).toHaveBeenCalledTimes(1);
    expect(props.onRestart).not.toHaveBeenCalled();
  });

  it('restarts the session from the menu', async () => {
    const props = renderMenu();

    await userEvent.click(trigger());
    await userEvent.click(
      await screen.findByRole('menuitem', {
        name: 'ai.artifacts.flashcards.restart',
      })
    );

    expect(props.onRestart).toHaveBeenCalledTimes(1);
  });

  it('keeps shuffle and restart but hides the rating mode from a read-only viewer', async () => {
    renderMenu({ readOnly: true });

    await userEvent.click(trigger());

    expect(
      await screen.findByRole('menuitem', {
        name: 'ai.artifacts.flashcards.shuffle',
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox')).toBeNull();
  });
});
