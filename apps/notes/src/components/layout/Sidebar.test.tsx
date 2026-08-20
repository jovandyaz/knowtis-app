import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from './Sidebar';

const authUser = vi.fn<() => { name: string; isAnonymous: boolean }>();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@knowtis/design-system', () => ({
  ResizablePanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/components/organization/BucketNav', () => ({
  BucketNav: () => <div data-testid="bucket-nav" />,
}));
vi.mock('./NavigationLinks', () => ({ NavigationLinks: () => null }));
vi.mock('./SidebarBrand', () => ({ SidebarBrand: () => null }));
vi.mock('./SidebarNotesSection', () => ({ SidebarNotesSection: () => null }));
vi.mock('./SidebarUserMenu', () => ({ SidebarUserMenu: () => null }));

describe('Sidebar', () => {
  beforeEach(() => {
    authUser.mockReturnValue({ name: 'Ada', isAnonymous: false });
  });

  it('offers the bucket navigation to a signed-up user', () => {
    render(<Sidebar />);

    expect(screen.getByTestId('bucket-nav')).toBeInTheDocument();
  });

  it('hides the bucket navigation from an anonymous visitor', () => {
    authUser.mockReturnValue({ name: 'Anonymous', isAnonymous: true });

    render(<Sidebar />);

    expect(screen.queryByTestId('bucket-nav')).not.toBeInTheDocument();
  });
});
