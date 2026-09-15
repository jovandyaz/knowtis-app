import type { ReactNode } from 'react';

import { useNotesSearchStore } from '@/stores/notes-search.store';
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from './Sidebar';

const authUser = vi.fn<() => { name: string; isAnonymous: boolean }>();

const { navigate, userAgent } = vi.hoisted(() => ({
  navigate: vi.fn<(options: { to: string }) => Promise<void>>(),
  userAgent: vi
    .spyOn(navigator, 'userAgent', 'get')
    .mockReturnValue('Macintosh'),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
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
vi.mock('@/components/organization/TagTree', () => ({
  TagTree: () => <div data-testid="tag-tree" />,
}));
vi.mock('@/components/organization/SupertagNav', () => ({
  SupertagNav: () => <div data-testid="supertag-nav" />,
}));
vi.mock('./NavigationLinks', () => ({ NavigationLinks: () => null }));
vi.mock('./SidebarBrand', () => ({ SidebarBrand: () => null }));
vi.mock('./SidebarNotesSection', () => ({ SidebarNotesSection: () => null }));
vi.mock('./SidebarUserMenu', () => ({ SidebarUserMenu: () => null }));

afterAll(() => userAgent.mockRestore());

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigate.mockResolvedValue(undefined);
    useNotesSearchStore.setState({ focusRequested: false, query: '' });
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

  it('opens and focuses note search with Cmd+K without a study overlay', async () => {
    render(<Sidebar />);

    await act(async () => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
    });

    expect(navigate).toHaveBeenCalledWith({ to: '/notes' });
    expect(useNotesSearchStore.getState().focusRequested).toBe(true);
  });

  it('prevents Cmd+K during study and resumes search after the overlay closes', async () => {
    render(<Sidebar />);
    const overlay = render(<div data-study-focus="" />);

    const event = createEvent.keyDown(document, { key: 'k', metaKey: true });
    await act(async () => {
      fireEvent(document, event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(useNotesSearchStore.getState().focusRequested).toBe(false);

    overlay.unmount();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(useNotesSearchStore.getState().focusRequested).toBe(true);
  });

  it('leaves non-matching keys untouched during study', async () => {
    render(<Sidebar />);
    render(<div data-study-focus="" />);

    for (const keys of [{ key: 'k' }, { key: 'x', metaKey: true }]) {
      const event = createEvent.keyDown(document, keys);
      await act(async () => {
        fireEvent(document, event);
      });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(navigate).not.toHaveBeenCalled();
    expect(useNotesSearchStore.getState().focusRequested).toBe(false);
  });
});
