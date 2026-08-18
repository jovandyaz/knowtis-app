import { create } from 'zustand';

export type SettingsSection =
  | 'profile'
  | 'appearance'
  | 'language'
  | 'editor'
  | 'notifications'
  | 'integrations'
  | 'connectedApps'
  | 'account'
  | 'aiAssistant';

export type SettingsFocusTarget = 'aiKeys';

interface SettingsStore {
  isOpen: boolean;
  activeSection: SettingsSection;
  focusTarget: SettingsFocusTarget | null;
  open: (section?: SettingsSection, focusTarget?: SettingsFocusTarget) => void;
  close: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  isOpen: false,
  activeSection: 'profile',
  focusTarget: null,
  open: (section = 'profile', focusTarget) =>
    set({
      isOpen: true,
      activeSection: section,
      focusTarget: focusTarget ?? null,
    }),
  close: () => set({ isOpen: false, focusTarget: null }),
}));
