import { AppShellNav } from '@/components/AppShellNav';
import { ADMIN_SECTIONS } from '@/config/admin-sections';
import { renderWithRouter } from '@/test/router';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const DASHBOARD_LABEL = 'Dashboard';
const LINKED_PATHS = ADMIN_SECTIONS.map((section) => section.to);
const NAV_LABELS = [
  DASHBOARD_LABEL,
  ...ADMIN_SECTIONS.map((section) => section.label),
];

const PHONE_TAP_TARGET_CLASS = 'max-md:min-h-11';

describe('AppShellNav', () => {
  it('renders Dashboard plus every admin section', async () => {
    await renderWithRouter(AppShellNav, LINKED_PATHS);

    for (const label of NAV_LABELS) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('gives every destination a 44px tap target on phone viewports', async () => {
    await renderWithRouter(AppShellNav, LINKED_PATHS);

    for (const label of NAV_LABELS) {
      expect(screen.getByRole('link', { name: label })).toHaveClass(
        PHONE_TAP_TARGET_CLASS
      );
    }
  });

  it.each(NAV_LABELS)('calls onNavigate when %s is chosen', async (label) => {
    const onNavigate = vi.fn();
    await renderWithRouter(
      () => <AppShellNav onNavigate={onNavigate} />,
      LINKED_PATHS
    );

    await userEvent.click(screen.getByRole('link', { name: label }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
