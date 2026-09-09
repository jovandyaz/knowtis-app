import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SharedNoteAccessError } from './SharedNoteAccessError';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/login">{children}</a>
  ),
}));

const defaultProps = {
  isNotFound: false,
  offerSignIn: false,
  onRetry: vi.fn(),
};

const renderScreen = (props: Partial<typeof defaultProps> = {}) =>
  render(<SharedNoteAccessError {...defaultProps} {...props} />);

const retryButton = () =>
  screen.queryByRole('button', { name: 'buttons.tryAgain' });

describe('SharedNoteAccessError', () => {
  it('offers a retry for a link that failed to load', async () => {
    const onRetry = vi.fn();
    renderScreen({ onRetry });

    expect(screen.getByText('errors.somethingWentWrong')).toBeInTheDocument();
    await userEvent.click(retryButton() as HTMLElement);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('withholds the retry from a link that does not exist', () => {
    renderScreen({ isNotFound: true });

    expect(screen.getByText('shared.linkNotFound')).toBeInTheDocument();
    expect(screen.getByText('shared.linkNotFoundDesc')).toBeInTheDocument();
    expect(retryButton()).toBeNull();
  });

  it('offers sign-in only to a visitor without an account', () => {
    const { unmount } = renderScreen({ offerSignIn: true });
    expect(
      screen.getByRole('link', { name: 'shared.signIn' })
    ).toBeInTheDocument();
    unmount();

    renderScreen({ offerSignIn: false });
    expect(screen.queryByRole('link', { name: 'shared.signIn' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'shared.goToKnowtis' })
    ).toBeInTheDocument();
  });
});
