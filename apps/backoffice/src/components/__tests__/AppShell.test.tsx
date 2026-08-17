import { AppShell } from '@/components/AppShell';
import { ADMIN_SECTIONS } from '@/config/admin-sections';
import { stubDesktopViewport, stubPhoneViewport } from '@/test/media-query';
import { renderWithRouter } from '@/test/router';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const USER_EMAIL = 'ada@knowtis.app';
const LINKED_PATHS = ADMIN_SECTIONS.map((section) => section.to);
const OPEN_NAV_LABEL = 'Open navigation';
const NAV_SHEET_TITLE = 'Navigation';
const SIDEBAR_NAV_GROW_CLASS = 'flex-1';
const TRIGGER_TAP_TARGET_CLASSES = ['h-11', 'w-11'];
const APP_BAR_HEIGHT_CLASS = 'h-(--app-bar-height)';

vi.mock('@/auth/setup', () => ({
  performLogout: vi.fn(),
}));

vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ id: 'admin-1', email: USER_EMAIL, role: 'admin' }),
}));

function renderShell() {
  return renderWithRouter(
    () => (
      <AppShell>
        <p>Page content</p>
      </AppShell>
    ),
    LINKED_PATHS
  );
}

describe('AppShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('on desktop', () => {
    it('renders the nav, the account block and its children', async () => {
      stubDesktopViewport();

      await renderShell();

      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByText(USER_EMAIL)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Sign out' })
      ).toBeInTheDocument();
      expect(screen.getByText('Page content')).toBeInTheDocument();
    });

    it('stretches the sidebar nav so the account block stays at the bottom', async () => {
      stubDesktopViewport();

      await renderShell();

      expect(screen.getByRole('navigation')).toHaveClass(
        SIDEBAR_NAV_GROW_CLASS
      );
    });

    // jsdom does not lay out: the class is the only observable part of "a wide
    // table scrolls inside its card instead of widening the whole page".
    it('lets a wide table scroll inside its card instead of the page', async () => {
      stubDesktopViewport();

      await renderShell();

      expect(screen.getByRole('main')).toHaveClass('min-w-0');
    });

    it('leaves the navigation sheet unmounted', async () => {
      stubDesktopViewport();

      await renderShell();

      expect(
        screen.queryByRole('button', { name: OPEN_NAV_LABEL })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('on a phone viewport', () => {
    it('hides the nav behind a menu button in a banner bar', async () => {
      stubPhoneViewport();

      await renderShell();

      const trigger = screen.getByRole('button', { name: OPEN_NAV_LABEL });
      expect(screen.getByRole('banner')).toContainElement(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.getByText('Page content')).toBeInTheDocument();
    });

    it('sizes the bar from the token page headers offset against', async () => {
      stubPhoneViewport();

      await renderShell();

      expect(screen.getByRole('banner')).toHaveClass(APP_BAR_HEIGHT_CLASS);
    });

    it('gives the menu trigger a 44px tap target that announces the sheet', async () => {
      stubPhoneViewport();

      await renderShell();

      const trigger = screen.getByRole('button', { name: OPEN_NAV_LABEL });
      expect(trigger).toHaveClass(...TRIGGER_TAP_TARGET_CLASSES);
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('opens the nav sheet and reports expansion', async () => {
      stubPhoneViewport();
      await renderShell();

      await userEvent.click(
        screen.getByRole('button', { name: OPEN_NAV_LABEL })
      );

      expect(
        await screen.findByRole('dialog', { name: NAV_SHEET_TITLE })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Feature Flags' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Sign out' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: OPEN_NAV_LABEL })
      ).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes the sheet once a destination is chosen', async () => {
      stubPhoneViewport();
      await renderShell();
      await userEvent.click(
        screen.getByRole('button', { name: OPEN_NAV_LABEL })
      );

      await userEvent.click(screen.getByRole('link', { name: 'AI Config' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: OPEN_NAV_LABEL })
      ).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('when the viewport crosses the desktop breakpoint', () => {
    it('does not bring an open sheet back after a rotation round trip', async () => {
      stubPhoneViewport();
      await renderShell();
      await userEvent.click(
        screen.getByRole('button', { name: OPEN_NAV_LABEL })
      );
      expect(
        await screen.findByRole('dialog', { name: NAV_SHEET_TITLE })
      ).toBeInTheDocument();

      stubDesktopViewport();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      stubPhoneViewport();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: OPEN_NAV_LABEL })
      ).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
