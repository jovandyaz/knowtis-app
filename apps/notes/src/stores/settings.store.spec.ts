import { beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from './settings.store';

describe('settings store', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      isOpen: false,
      activeSection: 'profile',
      focusTarget: null,
    });
  });

  it('opens a section with nothing focused when the caller names no target', () => {
    useSettingsStore.getState().open('aiAssistant');

    expect(useSettingsStore.getState().activeSection).toBe('aiAssistant');
    expect(useSettingsStore.getState().focusTarget).toBeNull();
  });

  it('carries the target the caller navigated for', () => {
    useSettingsStore.getState().open('aiAssistant', 'aiKeys');

    expect(useSettingsStore.getState().focusTarget).toBe('aiKeys');
  });

  it('drops the target when another section is opened', () => {
    useSettingsStore.getState().open('aiAssistant', 'aiKeys');
    useSettingsStore.getState().open('account');

    expect(useSettingsStore.getState().focusTarget).toBeNull();
  });

  it('drops the target on close, so reopening does not re-steal focus', () => {
    useSettingsStore.getState().open('aiAssistant', 'aiKeys');
    useSettingsStore.getState().close();

    expect(useSettingsStore.getState().focusTarget).toBeNull();
  });
});
