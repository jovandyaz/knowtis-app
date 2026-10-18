import { useEffect, useRef } from 'react';

import { useSettingsStore } from '@/stores/settings.store';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsModal } from './SettingsModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@knowtis/data-access-oauth', () => ({
  useConnectedAppsAvailable: () => false,
}));

function FocusingSection() {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);
  return <input ref={field} aria-label="first field" />;
}

vi.mock('./sections/AccountSection', () => ({ AccountSection: () => null }));
vi.mock('./sections/AIAssistantSection', () => ({
  AIAssistantSection: () => <FocusingSection />,
}));
vi.mock('./sections/AppearanceSection', () => ({
  AppearanceSection: () => null,
}));
vi.mock('./sections/ConnectedAppsSection', () => ({
  ConnectedAppsSection: () => null,
}));
vi.mock('./sections/IntegrationsSection', () => ({
  IntegrationsSection: () => null,
}));
vi.mock('./sections/LanguageSection', () => ({ LanguageSection: () => null }));
vi.mock('./sections/MemorySection', () => ({ MemorySection: () => null }));
vi.mock('./sections/PlanSection', () => ({ PlanSection: () => null }));
vi.mock('./sections/ProfileSection', () => ({ ProfileSection: () => null }));

describe('SettingsModal', () => {
  afterEach(() => {
    act(() => useSettingsStore.getState().close());
  });

  it('puts the focus on the section it opened to, not on the first one', async () => {
    render(<SettingsModal />);

    act(() => useSettingsStore.getState().open('memory'));

    const memory = await screen.findByRole('button', {
      name: 'settings.sections.memory',
    });
    await waitFor(() => expect(memory).toHaveFocus());
  });

  it('puts the focus on Profile when it opens without a section', async () => {
    render(<SettingsModal />);

    act(() => useSettingsStore.getState().open());

    const profile = await screen.findByRole('button', {
      name: 'settings.sections.profile',
    });
    await waitFor(() => expect(profile).toHaveFocus());
  });

  it('lets the dialog focus its first control when the section it opened to has no nav item', async () => {
    render(<SettingsModal />);

    act(() => useSettingsStore.getState().open('connectedApps'));

    const profile = await screen.findByRole('button', {
      name: 'settings.sections.profile',
    });
    expect(
      screen.queryByRole('button', { name: 'settings.sections.connectedApps' })
    ).not.toBeInTheDocument();
    await waitFor(() => expect(profile).toHaveFocus());
  });

  it('leaves the focus where the section it opened to put it', async () => {
    render(<SettingsModal />);

    act(() => useSettingsStore.getState().open('aiAssistant', 'aiKeys'));

    const field = await screen.findByRole('textbox', { name: 'first field' });
    await waitFor(() => expect(field).toHaveFocus());
  });
});
