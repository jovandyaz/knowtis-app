import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { createFileRoute, Outlet } from '@tanstack/react-router';

import { initAuth } from '@/auth/setup';
import {
  ArtifactMobileFAB,
  ArtifactSidebar,
  ArtifactSidebarToggle,
} from '@/components/artifacts';
import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useAIStore } from '@/stores/ai.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useAuthLoading, useAuthUser } from '@jovandyaz/auth-react';
import { PanelLeft } from 'lucide-react';
import { motion } from 'motion/react';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

function ArtifactSidebarLayout() {
  const noteId = useArtifactSidebarStore((s) => s.activeNoteId);
  if (!noteId) {
    return null;
  }
  return <ArtifactSidebar noteId={noteId} />;
}

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
  const activeNoteId = useArtifactSidebarStore((s) => s.activeNoteId);

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
    <div className="flex h-screen overflow-hidden bg-(--background)">
      <Sidebar />
      {!isAnonymous && <SettingsModal />}
      <BottomNav />
      {aiEnabled && <ArtifactMobileFAB />}

      <main
        className={`flex-1 flex min-w-0 min-h-0 transition-all duration-300 pb-20 md:pb-0 ${
          sidebarCollapsed ? 'md:pl-0' : 'md:pl-56'
        }`}
      >
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="hidden md:flex items-center justify-between h-12 shrink-0 px-3">
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

            <div className="flex items-center gap-1">
              <div
                id="note-controls-portal"
                className="flex items-center gap-1"
              />
              {activeNoteId && aiEnabled && <ArtifactSidebarToggle />}
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4 md:px-8 md:pt-3 md:pb-8 w-full overflow-y-auto">
            <Outlet />
          </div>
        </div>
        {aiEnabled && <ArtifactSidebarLayout />}
      </main>
    </div>
  );
}
