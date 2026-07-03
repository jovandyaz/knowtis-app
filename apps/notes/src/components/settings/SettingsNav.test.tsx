import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsNav } from './SettingsNav';

const useConnectedAppsAvailable = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@knowtis/data-access-oauth', () => ({
  useConnectedAppsAvailable: () => useConnectedAppsAvailable(),
}));

describe('SettingsNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the connected apps entry when the feature is unavailable (flag off)', () => {
    useConnectedAppsAvailable.mockReturnValue(false);

    render(<SettingsNav activeSection="profile" onSectionChange={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'settings.sections.connectedApps' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'settings.sections.integrations' })
    ).toBeInTheDocument();
  });

  it('shows the connected apps entry when the feature is available', () => {
    useConnectedAppsAvailable.mockReturnValue(true);

    render(<SettingsNav activeSection="profile" onSectionChange={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'settings.sections.connectedApps' })
    ).toBeInTheDocument();
  });
});
