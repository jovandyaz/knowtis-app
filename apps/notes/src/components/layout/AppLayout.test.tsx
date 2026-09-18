import type * as Router from '@tanstack/react-router';

import { ROUTES } from '@/config/routes.config';
import { Route } from '@/routes/_app';
import { useNoteEditorStore } from '@/stores/note-editor.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import type * as AuthReact from '@jovandyaz/auth-react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: null as { name: string; isAnonymous: boolean } | null,
}));
const location = vi.hoisted(() => ({ pathname: '/dashboard' }));
const features = vi.hoisted(() => ({ enabled: false }));
const outlet = vi.hoisted(() => ({ renders: 0 }));

vi.mock('@jovandyaz/auth-react', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthReact>()),
  useAuthLoading: () => false,
  useAuthUser: () => auth.user,
}));

vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => features.enabled,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  Outlet: () => {
    outlet.renders += 1;
    return <div data-testid="outlet" />;
  },
  useLocation: ({
    select,
  }: {
    select: (value: { pathname: string }) => string;
  }) => select(location),
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('@/components/layout/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/layout/MobileFabRail', () => ({
  MobileFabRail: () => null,
}));
vi.mock('@/components/settings/SettingsModal', () => ({
  SettingsModal: () => null,
}));
vi.mock('@/components/auth/VerifyEmailBanner', () => ({
  VerifyEmailBanner: () => null,
}));
vi.mock('@/components/auth/VerifyEmailDialog', () => ({
  VerifyEmailDialog: () => null,
}));
vi.mock('@/components/anonymous/AnonymousLimitModal', () => ({
  AnonymousLimitModal: () => null,
}));
vi.mock('@/components/artifacts/ArtifactGenerator', () => ({
  ArtifactGeneratorDialog: () => null,
}));
vi.mock('@/components/right-dock', () => ({
  CopilotMobileFAB: () => null,
  RightDock: () => null,
  RightDockToggle: () => <button data-testid="right-dock-toggle" />,
}));

function renderAppLayout() {
  const AppLayout = Route.options.component;
  if (!AppLayout) {
    throw new Error('The app route must render its layout');
  }
  return render(<AppLayout />);
}

describe('AppLayout', () => {
  beforeEach(() => {
    auth.user = { name: 'Ada', isAnonymous: false };
    useSidebarStore.setState(useSidebarStore.getInitialState(), true);
    useNoteEditorStore.setState({ noteId: null, title: '', editor: null });
    location.pathname = '/dashboard';
    features.enabled = false;
  });

  it.each([
    ['/dashboard', 'labels.home'],
    ['/study', 'labels.study'],
    ['/notes', 'labels.notes'],
    [ROUTES.OAUTH_CONSENT, 'oauth.title'],
  ])(
    'shows view context at %s without adding another h1',
    (pathname, label) => {
      location.pathname = pathname;
      renderAppLayout();
      expect(screen.getByText(label)).toHaveClass(
        'min-w-0',
        'truncate',
        'text-sm'
      );
      expect(
        screen.queryByRole('heading', { level: 1 })
      ).not.toBeInTheDocument();
    }
  );

  it('follows the active note title without making the context editable', () => {
    location.pathname = '/notes/note-1';
    useNoteEditorStore.setState({
      noteId: 'note-1',
      title: 'A long document title',
    });
    renderAppLayout();
    const context = screen.getByText('A long document title');
    expect(context).toHaveAttribute('title', 'A long document title');
    expect(context).not.toHaveAttribute('contenteditable');
    act(() =>
      useNoteEditorStore.getState().setTitle('note-1', 'Renamed document')
    );
    expect(screen.getByText('Renamed document')).toBeInTheDocument();
  });

  it('uses the translated untitled label for an empty active title', () => {
    location.pathname = '/notes/note-1';
    useNoteEditorStore.setState({ noteId: 'note-1', title: '  ' });
    renderAppLayout();
    expect(screen.getByText('sidebar.untitled')).toBeInTheDocument();
  });

  it('does not leak a stale editor title into another view', () => {
    useNoteEditorStore.setState({ noteId: 'note-1', title: 'Previous note' });
    renderAppLayout();
    expect(screen.getByText('labels.home')).toBeInTheDocument();
    expect(screen.queryByText('Previous note')).not.toBeInTheDocument();
  });

  it('keeps context shrinkable and the shell header free of a decorative divider', () => {
    renderAppLayout();
    const label = screen.getByText('labels.home');
    const header = label.closest('header');
    expect(header).toHaveClass('h-12', 'px-4');
    expect(header).not.toHaveClass('border-b', 'shadow-sm', 'bg-muted');
    expect(label.parentElement).toHaveClass(
      'flex',
      'min-w-0',
      'items-center',
      'gap-2'
    );
    const portal = document.getElementById('note-controls-portal');
    expect(portal).toHaveClass('min-w-0', 'gap-2');
    expect(portal?.parentElement).toHaveClass('min-w-0', 'gap-2');
  });

  it('leaves the note controls to style their own children', () => {
    renderAppLayout();

    const portal = document.getElementById('note-controls-portal');
    const childSelectors = portal?.className
      .split(' ')
      .filter((token) => token.includes('[&') || token.includes('*:'));

    expect(childSelectors).toEqual([]);
  });

  it('separates Copilot by spacing without leaving a decorative rule', () => {
    features.enabled = true;
    renderAppLayout();

    const copilotGroup = screen.getByTestId('right-dock-toggle').parentElement;
    expect(copilotGroup).toHaveClass('ml-2', 'shrink-0');
    expect(copilotGroup).not.toHaveClass('border-l');
    expect(copilotGroup).not.toHaveClass('border-border');
    expect(copilotGroup).not.toHaveClass('pl-2');
    expect(copilotGroup).not.toHaveClass('shadow-sm');
    expect(copilotGroup).not.toHaveClass('bg-muted');
  });

  it('offsets the document by the sidebar width variable on desktop only', () => {
    renderAppLayout();

    const main = screen.getByRole('main');
    expect(main).toHaveClass('md:pl-(--app-sidebar-width)');
    expect(main).not.toHaveAttribute('style');
  });

  it('keeps the offset out of the render path so a drag cannot re-render it', () => {
    renderAppLayout();
    const rendersBeforeDrag = outlet.renders;

    act(() => useSidebarStore.getState().setVisibleWidth(360));

    expect(outlet.renders).toBe(rendersBeforeDrag);
    expect(screen.getByRole('main')).toHaveClass('md:pl-(--app-sidebar-width)');
  });

  it('collapses the sidebar for an anonymous visitor', () => {
    auth.user = { name: 'Anonymous', isAnonymous: true };

    renderAppLayout();

    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it('leaves the sidebar open for a signed-up user', () => {
    renderAppLayout();

    expect(useSidebarStore.getState().collapsed).toBe(false);
  });
});
