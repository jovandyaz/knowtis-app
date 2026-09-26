import { useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';

import { SessionExpiredError } from '@/auth';
import { initAuth } from '@/auth/setup';
import { AnonymousLimitModal } from '@/components/anonymous/AnonymousLimitModal';
import { ArtifactGeneratorDialog } from '@/components/artifacts/ArtifactGenerator';
import { isStudyFocusOpen } from '@/components/artifacts/focus/study-focus-marker';
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
import { ROUTES } from '@/config/routes.config';
import { useAIStore } from '@/stores/ai.store';
import { useAnonymousLimitStore } from '@/stores/anonymous-limit.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { useNoteEditorStore } from '@/stores/note-editor.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { useAuthLoading, useAuthUser } from '@jovandyaz/auth-react';
import { PanelLeft } from 'lucide-react';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { Button } from '@knowtis/design-system';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';
import { isMacPlatform } from '@knowtis/shared-util';

function RightDockLayout() {
  return <RightDock />;
}

function ShellContextLabel() {
  const { t } = useTranslation(['common', 'notes']);
  const pathname = useLocation({ select: (location) => location.pathname });
  const noteTitle = useNoteEditorStore((state) =>
    state.noteId && pathname === `/notes/${state.noteId}` ? state.title : null
  );
  const viewLabel =
    pathname === ROUTES.DASHBOARD
      ? t('labels.home')
      : pathname === ROUTES.STUDY
        ? t('labels.study')
        : pathname === ROUTES.OAUTH_CONSENT
          ? t('oauth.title')
          : t('labels.notes');
  const label =
    noteTitle === null
      ? viewLabel
      : noteTitle.trim() || t('sidebar.untitled', { ns: 'notes' });

  return (
    <span className="min-w-0 truncate text-sm" title={label}>
      {label}
    </span>
  );
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
        // A dead session's link intent must not greet whoever signs in next.
        useVerifyEmailStore.getState().close();
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
  const setSidebarCollapsed = useSidebarStore((s) => s.setCollapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const aiEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED);
  const setAIEnabled = useAIStore((s) => s.setAIEnabled);
  const showLimitModal = useAnonymousLimitStore((s) => s.showModal);
  const closeLimitModal = useAnonymousLimitStore((s) => s.closeModal);
  const toggleDock = useRightDockStore((s) => s.toggle);

  useEffect(() => {
    const isMac = isMacPlatform();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(isMac ? e.metaKey : e.ctrlKey) || e.key.toLowerCase() !== 'j') {
        return;
      }
      if (isStudyFocusOpen()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      toggleDock();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleDock]);

  useEffect(() => {
    setSidebarCollapsed(isAnonymous);
  }, [isAnonymous, setSidebarCollapsed]);

  useLayoutEffect(() => {
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

      <main className="flex-1 flex min-w-0 min-h-0 pb-20 md:pb-0 md:pl-(--app-sidebar-width)">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <VerifyEmailBanner />
          <header className="hidden md:flex h-12 shrink-0 items-center justify-between gap-2 px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Button
                id="sidebar-toggle"
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggle}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={
                  sidebarCollapsed
                    ? t('labels.expandSidebar')
                    : t('labels.collapseSidebar')
                }
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              <ShellContextLabel />
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <div
                id="note-controls-portal"
                className="flex min-w-0 items-center gap-2"
              />
              {aiEnabled && (
                <div className="ml-2 shrink-0">
                  <RightDockToggle />
                </div>
              )}
            </div>
          </header>
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
