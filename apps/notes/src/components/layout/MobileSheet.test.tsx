import { useState, type ComponentProps, type ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MobileSheet } from './MobileSheet';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      children,
      ...rest
    }: ComponentProps<'div'> & Record<string, unknown>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

function Harness({ onClose }: { onClose?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        open
      </button>
      <MobileSheet
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          onClose?.();
        }}
        label="Explore"
      >
        <button type="button">inside</button>
      </MobileSheet>
    </>
  );
}

describe('MobileSheet', () => {
  // Radix expresses modality by hiding everything else rather than by
  // aria-modal, so the opener is what proves the page went away.
  it('announces itself as a dialog and hides the page behind it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'open' }));

    expect(screen.getByRole('dialog', { name: 'Explore' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'open' })
    ).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'open' }));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // The sheet is opened from the bottom nav, not from a Dialog.Trigger, so Radix
  // has no opener to restore — MobileSheet captures and restores it by hand.
  it('returns focus to whatever opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const opener = screen.getByRole('button', { name: 'open' });
    await user.click(opener);
    await user.keyboard('{Escape}');

    expect(opener).toHaveFocus();
  });
});
