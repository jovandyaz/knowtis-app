import type { ComponentProps, ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BottomNav } from './BottomNav';

const authUser = vi.fn<() => { isAnonymous: boolean }>();

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/notes' }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ navigate: vi.fn() }),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));
vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: (selector: (state: { open: () => void }) => unknown) =>
    selector({ open: vi.fn() }),
}));
vi.mock('@/components/organization/BucketNav', () => ({
  BucketNav: ({ onNavigate }: { onNavigate?: () => void }) => (
    <button type="button" data-testid="bucket-nav" onClick={onNavigate}>
      bucket
    </button>
  ),
}));
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

describe('BottomNav', () => {
  beforeEach(() => {
    authUser.mockReturnValue({ isAnonymous: false });
  });

  it('offers explore next to the primary destinations', () => {
    render(<BottomNav />);

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'labels.home',
      'labels.notes',
      'labels.explore',
      'settings.title',
    ]);
  });

  it('hides explore from an anonymous visitor', () => {
    authUser.mockReturnValue({ isAnonymous: true });
    render(<BottomNav />);

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'labels.home',
      'labels.notes',
      'settings.title',
    ]);
  });

  it('opens the bucket sheet from the explore tab', async () => {
    const user = userEvent.setup();
    render(<BottomNav />);

    expect(screen.queryByTestId('bucket-nav')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'labels.explore' }));

    expect(screen.getByTestId('bucket-nav')).toBeInTheDocument();
  });

  it('closes the sheet once a bucket is picked', async () => {
    const user = userEvent.setup();
    render(<BottomNav />);

    await user.click(screen.getByRole('button', { name: 'labels.explore' }));
    await user.click(screen.getByTestId('bucket-nav'));

    expect(screen.queryByTestId('bucket-nav')).not.toBeInTheDocument();
  });

  it('offers account actions to an anonymous visitor', async () => {
    const user = userEvent.setup();
    authUser.mockReturnValue({ isAnonymous: true });
    render(<BottomNav />);

    await user.click(screen.getByRole('button', { name: 'settings.title' }));

    expect(
      screen.getByRole('button', { name: 'nav.createAccount' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'nav.signIn' })
    ).toBeInTheDocument();
  });
});
