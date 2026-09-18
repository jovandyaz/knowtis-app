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

import type * as DesignSystem from '@knowtis/design-system';

import { APP_SIDEBAR_WIDTH_VAR, Sidebar } from './Sidebar';

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
  onWidthChange: (width: number) => void;
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
vi.mock('@knowtis/design-system', async (importOriginal) => ({
  ...(await importOriginal<typeof DesignSystem>()),
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
  screen.getByRole('button', { name: 'labels.searchNotes' });

const sidebarWidthVariable = () =>
  document.documentElement.style.getPropertyValue(APP_SIDEBAR_WIDTH_VAR);

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    panel.props = null;
    navigate.mockResolvedValue(undefined);
    useNotesSearchStore.setState({ focusRequested: false, query: '' });
    useSidebarStore.setState({ collapsed: false, visibleWidth: 0 });
    useSidebarPreferenceStore.setState({ preferredWidth: 272 });
    localStorage.clear();
    authUser.mockReturnValue({ name: 'Ada', isAnonymous: false });
    userAgent.mockReturnValue('Macintosh');
  });

  it('offers a legible search action with the platform shortcut and shared icon rail', () => {
    render(<Sidebar />);

    const search = searchTrigger();
    expect(search).toHaveClass(
      'w-full',
      'min-h-9',
      'px-2',
      'text-sm',
      'bg-muted/50',
      'hover:bg-muted',
      'text-foreground',
      'focus-visible:ring-2'
    );
    expect(search).toHaveAttribute('aria-keyshortcuts', 'Meta+K');
    expect(search.querySelector('svg')).toHaveClass('h-4', 'w-4');
    expect(search.querySelector('svg')?.parentElement).toHaveClass('w-4');
    expect(search.querySelector('kbd')).toHaveAttribute('aria-hidden', 'true');
    expect(search.querySelector('kbd')).toHaveTextContent('⌘K');
  });

  it('advertises and handles Control+K on non-Mac platforms', async () => {
    userAgent.mockReturnValue('Windows');
    render(<Sidebar />);
    expect(searchTrigger()).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    expect(searchTrigger().querySelector('kbd')).toHaveTextContent('Ctrl+K');
    await act(async () =>
      fireEvent.keyDown(document, { key: 'K', ctrlKey: true })
    );
    expect(navigate).toHaveBeenCalledWith({
      to: '/notes',
      search: { view: 'all' },
    });
  });

  it('requests focus only after navigation to all notes completes', async () => {
    let finishNavigation: () => void = () => undefined;
    navigate.mockReturnValue(
      new Promise<void>((resolve) => {
        finishNavigation = resolve;
      })
    );
    render(<Sidebar />);
    fireEvent.click(searchTrigger());
    expect(navigate).toHaveBeenCalledWith({
      to: '/notes',
      search: { view: 'all' },
    });
    expect(useNotesSearchStore.getState().focusRequested).toBe(false);
    await act(async () => finishNavigation());
    expect(useNotesSearchStore.getState().focusRequested).toBe(true);
  });

  it.each(['handled', 'composing'])(
    'ignores a %s search shortcut',
    async (state) => {
      render(<Sidebar />);
      const event = createEvent.keyDown(document, {
        key: 'k',
        metaKey: true,
        isComposing: state === 'composing',
      });
      if (state === 'handled') {
        event.preventDefault();
      }
      await act(async () => fireEvent(document, event));
      expect(navigate).not.toHaveBeenCalled();
      expect(useNotesSearchStore.getState().focusRequested).toBe(false);
    }
  );

  it.each([{ shiftKey: true }, { altKey: true }, { ctrlKey: true }])(
    'ignores Meta+K with extra modifiers: %o',
    async (modifiers) => {
      render(<Sidebar />);
      await act(async () =>
        fireEvent.keyDown(document, {
          key: 'K',
          metaKey: true,
          ...modifiers,
        })
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(useNotesSearchStore.getState().focusRequested).toBe(false);
    }
  );

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
    expect(useSidebarStore.getState().visibleWidth).toBe(320);
  });

  it('drives the layout offset through a custom property while dragging', () => {
    render(<Sidebar />);

    act(() => panel.props?.onWidthChange(311));

    expect(sidebarWidthVariable()).toBe('311px');
    expect(useSidebarStore.getState().visibleWidth).toBe(272);
  });

  it('clears the layout offset when the sidebar unmounts', () => {
    const view = render(<Sidebar />);
    act(() => panel.props?.onWidthChange(311));
    expect(sidebarWidthVariable()).toBe('311px');

    view.unmount();

    expect(sidebarWidthVariable()).toBe('');
  });

  it('reports no visible width while collapsed', () => {
    render(<Sidebar />);
    expect(useSidebarStore.getState().visibleWidth).toBe(272);

    act(() => useSidebarStore.getState().setCollapsed(true));

    expect(useSidebarStore.getState().visibleWidth).toBe(0);
  });

  it('reports the preferred width again when it reopens', () => {
    render(<Sidebar />);
    act(() => useSidebarStore.getState().setCollapsed(true));

    act(() => useSidebarStore.getState().setCollapsed(false));

    expect(useSidebarStore.getState().visibleWidth).toBe(272);
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
      'overflow-y-auto',
      'px-3'
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

    expect(navigate).toHaveBeenCalledWith({
      to: '/notes',
      search: { view: 'all' },
    });
    expect(useNotesSearchStore.getState().focusRequested).toBe(true);
  });

  it('opens search from the launcher while Study Focus is active', async () => {
    render(<Sidebar />);
    render(<div data-study-focus="" />);

    await act(async () => fireEvent.click(searchTrigger()));

    expect(navigate).toHaveBeenCalledWith({
      to: '/notes',
      search: { view: 'all' },
    });
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
