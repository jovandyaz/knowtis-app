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

function sectionOrder(): (string | null)[] {
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));
}

describe('SettingsNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the connected apps entry when the feature is unavailable (OAuth not configured)', () => {
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

  it('lists Memory right after the AI assistant, then the Plan', () => {
    useConnectedAppsAvailable.mockReturnValue(false);

    render(<SettingsNav activeSection="profile" onSectionChange={vi.fn()} />);

    const sections = sectionOrder();
    const aiAssistant = sections.indexOf('settings.sections.aiAssistant');
    expect(sections.slice(aiAssistant, aiAssistant + 3)).toEqual([
      'settings.sections.aiAssistant',
      'settings.sections.memory',
      'settings.sections.plan',
    ]);
  });
});
