import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { SessionExpiredError } from '@/auth';
import { initAuth } from '@/auth/setup';
import { AnonymousLimitModal } from '@/components/anonymous/AnonymousLimitModal';
import { ArtifactGeneratorDialog } from '@/components/artifacts';
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner';
import { VerifyEmailDialog } from '@/components/auth/VerifyEmailDialog';
import { BottomNav } from '@/components/layout/BottomNav';
import { MobileFabRail } from '@/components/layout/MobileFabRail';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  CopilotMobileFAB,
  RightDock,
  RightDockToggle,
} from '@/components/right-dock';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { ROUTES } from '@/config';
import { useAIStore } from '@/stores/ai.store';
import { useAnonymousLimitStore } from '@/stores/anonymous-limit.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useAuthLoading, useAuthUser } from '@jovandyaz/auth-react';
import { PanelLeft } from 'lucide-react';
import { motion } from 'motion/react';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { useMediaQuery } from '@knowtis/shared-hooks';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

function RightDockLayout() {
  return <RightDock />;
}

function ArtifactGeneratorDialogLayout() {
  const noteId = useArtifactSidebarStore((s) => s.activeNoteId);
  if (!noteId) {
    return null;
  }
  return <ArtifactGeneratorDialog noteId={noteId} />;
}

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    try {
      await initAuth();
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        throw redirect({
          to: ROUTES.LOGIN,
          search: { redirect: location.href },
        });
      }
      throw error;
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const user = useAuthUser();
  const isLoading = useAuthLoading();
  const { t, i18n } = useTranslation('common');
  const isAnonymous = user?.isAnonymous ?? false;
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
  const sidebarWidth = useSidebarStore((s) => s.width);
  const setSidebarCollapsed = useSidebarStore((s) => s.setCollapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const aiEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED);
  const setAIEnabled = useAIStore((s) => s.setAIEnabled);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const showLimitModal = useAnonymousLimitStore((s) => s.showModal);
  const closeLimitModal = useAnonymousLimitStore((s) => s.closeModal);
  const toggleDock = useRightDockStore((s) => s.toggle);

  useEffect(() => {
    const isMac = /Mac/i.test(navigator.userAgent);
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleDock();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleDock]);

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
      <VerifyEmailDialog />
      <AnonymousLimitModal open={showLimitModal} onClose={closeLimitModal} />
      <BottomNav />
      <MobileFabRail>{aiEnabled && <CopilotMobileFAB />}</MobileFabRail>

      <main
        className="flex-1 flex min-w-0 min-h-0 pb-20 md:pb-0"
        style={{ paddingLeft: isDesktop ? `${sidebarWidth}px` : undefined }}
      >
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <VerifyEmailBanner />
          <div className="hidden md:flex items-center justify-between h-12 shrink-0 px-3">
            <motion.button
              type="button"
              onClick={toggle}
              className="p-1.5 rounded-md text-(--muted-foreground)/40 hover:text-(--muted-foreground) transition-colors cursor-pointer"
              aria-label={
                sidebarCollapsed
                  ? t('labels.expandSidebar')
                  : t('labels.collapseSidebar')
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
              {aiEnabled && <RightDockToggle />}
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4 md:px-8 md:pt-3 md:pb-8 w-full overflow-y-auto">
            <Outlet />
          </div>
        </div>
        {aiEnabled && <RightDockLayout />}
      </main>
      {aiEnabled && <ArtifactGeneratorDialogLayout />}
    </div>
  );
}
