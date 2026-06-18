import { create } from 'zustand';

export type SettingsSection =
  | 'profile'
  | 'appearance'
  | 'language'
  | 'editor'
  | 'notifications'
  | 'integrations'
  | 'account'
  | 'aiAssistant';

interface SettingsStore {
  isOpen: boolean;
  activeSection: SettingsSection;
  open: (section?: SettingsSection) => void;
  close: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  isOpen: false,
  activeSection: 'profile',
  open: (section = 'profile') => set({ isOpen: true, activeSection: section }),
  close: () => set({ isOpen: false }),
}));
