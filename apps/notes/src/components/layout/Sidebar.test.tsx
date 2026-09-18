import type { ReactNode, Ref } from 'react';

import { useNotesSearchStore } from '@/stores/notes-search.store';
import { useSidebarPreferenceStore } from '@/stores/sidebar-preference.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from './Sidebar';

interface PanelMockProps {
  children: ReactNode;
  ref: Ref<HTMLDivElement>;
  className: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  collapseThreshold: number;
  isOpen: boolean;
  onCollapse: () => void;
  onResizeEnd: (width: number) => void;
}

const authUser = vi.fn<() => { name: string; isAnonymous: boolean }>();

const panel = vi.hoisted(() => ({
  props: null as Omit<PanelMockProps, 'children' | 'ref'> | null,
}));

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
  ResizablePanel: ({ children, ref, ...props }: PanelMockProps) => {
    panel.props = props;
    return (
      <div data-testid="sidebar-panel" ref={ref} className={props.className}>
        {children}
      </div>
    );
  },
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

const searchTrigger = () =>
  screen.getByText('labels.search').closest('button') as HTMLElement;

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    panel.props = null;
    navigate.mockResolvedValue(undefined);
    useNotesSearchStore.setState({ focusRequested: false, query: '' });
    useSidebarStore.setState({ collapsed: false, width: 0 });
    useSidebarPreferenceStore.setState({ preferredWidth: 272 });
    localStorage.clear();
    authUser.mockReturnValue({ name: 'Ada', isAnonymous: false });
  });

  it('opens at the persisted preferred width within the resize bounds', () => {
    useSidebarPreferenceStore.setState({ preferredWidth: 300 });

    render(<Sidebar />);

    expect(panel.props?.defaultWidth).toBe(300);
    expect(panel.props?.minWidth).toBe(224);
    expect(panel.props?.maxWidth).toBe(360);
  });

  it('returns focus to the sidebar toggle when the collapsing panel holds it', () => {
    render(
      <>
        <button type="button" id="sidebar-toggle">
          toggle
        </button>
        <Sidebar />
      </>
    );
    searchTrigger().focus();

    act(() => panel.props?.onCollapse());

    expect(screen.getByRole('button', { name: 'toggle' })).toHaveFocus();
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('leaves focus alone when the collapsing panel does not hold it', () => {
    render(
      <>
        <button type="button" id="sidebar-toggle">
          toggle
        </button>
        <button type="button">Outside</button>
        <Sidebar />
      </>
    );
    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();

    act(() => panel.props?.onCollapse());

    expect(outside).toHaveFocus();
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('collapses on a host that offers no sidebar toggle', () => {
    render(<Sidebar />);
    const search = searchTrigger();
    search.focus();

    act(() => panel.props?.onCollapse());

    expect(search).toHaveFocus();
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('persists the width the user settles on', () => {
    render(<Sidebar />);

    act(() => panel.props?.onResizeEnd(320));

    expect(useSidebarPreferenceStore.getState().preferredWidth).toBe(320);
  });

  it('renders an opaque panel whose divider is the resize handle', () => {
    render(<Sidebar />);

    expect(panel.props?.className).toBe(
      'hidden md:flex flex-col fixed inset-y-0 left-0 z-40 bg-background'
    );
  });

  it('lets the panel column follow the resized width', () => {
    render(<Sidebar />);
    const column = screen.getByTestId('sidebar-panel').firstElementChild;

    expect(column).toHaveClass(
      'flex',
      'h-full',
      'w-full',
      'min-w-0',
      'flex-col'
    );
    expect(column).not.toHaveAttribute('style');
  });

  it('keeps the scrolling section from widening the sidebar', () => {
    render(<Sidebar />);

    expect(screen.getByTestId('bucket-nav').parentElement).toHaveClass(
      'min-w-0',
      'overflow-x-hidden',
      'overflow-y-auto'
    );
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
