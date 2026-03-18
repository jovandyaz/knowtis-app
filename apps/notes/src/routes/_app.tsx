import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { createFileRoute, Outlet } from '@tanstack/react-router';

import { initAuth } from '@/auth/setup';
import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useAIStore } from '@/stores/ai.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useAuthLoading, useAuthUser } from '@jovandyaz/auth-react';
import { PanelLeft } from 'lucide-react';
import { motion } from 'motion/react';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    await initAuth();
  },
  component: AppLayout,
});

function AppLayout() {
  const user = useAuthUser();
  const isLoading = useAuthLoading();
  const { i18n } = useTranslation('common');
  const isAnonymous = user?.isAnonymous ?? false;
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
  const setSidebarCollapsed = useSidebarStore((s) => s.setCollapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const aiEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED);
  const setAIEnabled = useAIStore((s) => s.setAIEnabled);

  useEffect(() => {
    setSidebarCollapsed(isAnonymous);
  }, [isAnonymous, setSidebarCollapsed]);

  useEffect(() => {
    setAIEnabled(aiEnabled);
  }, [aiEnabled, setAIEnabled]);

  useEffect(() => {
    if (user?.locale && user.locale !== i18n.language) {
      i18n.changeLanguage(user.locale);
    }
  }, [user?.locale, i18n]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--background)">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-(--muted) border-t-(--primary)" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-(--background)">
      <Sidebar />
      {!isAnonymous && <SettingsModal />}
      <BottomNav />

      <main
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 pb-20 md:pb-0 ${
          sidebarCollapsed ? 'md:pl-0' : 'md:pl-56'
        }`}
      >
        <div className="hidden md:flex items-center justify-between h-16 px-3 border-b border-border/20">
          <motion.button
            type="button"
            onClick={toggle}
            className="p-1.5 rounded-md text-(--muted-foreground)/40 hover:text-(--muted-foreground) transition-colors cursor-pointer"
            aria-label={
              sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
            }
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <PanelLeft className="h-4 w-4" />
          </motion.button>
        </div>
        <div className="flex-1 p-4 md:p-8 w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
