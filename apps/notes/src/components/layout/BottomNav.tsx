import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';

import { BucketNav } from '@/components/organization/BucketNav';
import { TagTree } from '@/components/organization/TagTree';
import { ROUTES } from '@/config';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import {
  FileText,
  FolderOpen,
  Home,
  LogIn,
  Settings,
  UserPlus,
} from 'lucide-react';

import { cn } from '@knowtis/design-system';

import { MobileSheet } from './MobileSheet';

const NOTE_EDITOR_PATTERN = /^\/notes\/[^/]+$/;

interface BottomNavTab {
  icon: typeof Home;
  labelKey:
    | 'labels.home'
    | 'labels.notes'
    | 'labels.explore'
    | 'settings.title';
  to?: string;
  action?: () => void;
}

export function BottomNav() {
  const { t } = useTranslation('common');
  const { t: tNotes } = useTranslation('notes');
  const router = useRouter();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const openSettings = useSettingsStore((s) => s.open);
  const user = useAuthUser();
  const isAnonymous = user?.isAnonymous ?? false;
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const [isExploreSheetOpen, setIsExploreSheetOpen] = useState(false);

  if (NOTE_EDITOR_PATTERN.test(currentPath)) {
    return null;
  }

  const exploreTab: BottomNavTab = {
    icon: FolderOpen,
    labelKey: 'labels.explore',
    action: () => setIsExploreSheetOpen(true),
  };

  const tabs: BottomNavTab[] = [
    { icon: Home, labelKey: 'labels.home', to: ROUTES.DASHBOARD },
    { icon: FileText, labelKey: 'labels.notes', to: ROUTES.NOTES },
    ...(isAnonymous ? [] : [exploreTab]),
    {
      icon: Settings,
      labelKey: 'settings.title',
      ...(isAnonymous
        ? { action: () => setIsAccountSheetOpen(true) }
        : { action: () => openSettings() }),
    },
  ];

  const isActive = (tab: BottomNavTab) => {
    if (!tab.to) {
      return false;
    }
    if (tab.to === '/') {
      return currentPath === '/';
    }
    return currentPath.startsWith(tab.to);
  };

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-(--border) bg-(--background)/90 backdrop-blur-xl md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-16 items-center justify-around">
          {tabs.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;

            const handleClick = () => {
              if (tab.action) {
                tab.action();
              } else if (tab.to) {
                router.navigate({ to: tab.to });
              }
            };

            return (
              <button
                key={tab.labelKey}
                type="button"
                onClick={handleClick}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] px-2 py-1 rounded-xl transition-colors',
                  active ? 'text-(--primary)' : 'text-(--muted-foreground)'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center h-7 w-12 rounded-full transition-colors',
                    active && 'bg-(--primary)/10'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium leading-none">
                  {t(tab.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {!isAnonymous && (
        <MobileSheet
          isOpen={isExploreSheetOpen}
          onClose={() => setIsExploreSheetOpen(false)}
          label={tNotes('organization.explore')}
        >
          <div className="flex flex-col gap-4">
            <BucketNav onNavigate={() => setIsExploreSheetOpen(false)} />
            <TagTree onNavigate={() => setIsExploreSheetOpen(false)} />
          </div>
        </MobileSheet>
      )}

      {isAnonymous && (
        <MobileSheet
          isOpen={isAccountSheetOpen}
          onClose={() => setIsAccountSheetOpen(false)}
          label={t('nav.account')}
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                void navigate({ to: ROUTES.REGISTER });
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-(--primary)/10 px-4 py-3.5 text-(--primary) transition-colors active:bg-(--primary)/20"
            >
              <UserPlus className="h-5 w-5 shrink-0" />
              <span className="font-medium">{t('nav.createAccount')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsAccountSheetOpen(false);
                void navigate({
                  to: ROUTES.LOGIN,
                  search: { redirect: undefined },
                });
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-(--muted)/50 px-4 py-3.5 text-(--foreground) transition-colors active:bg-(--muted)"
            >
              <LogIn className="h-5 w-5 shrink-0" />
              <span className="font-medium">{t('nav.signIn')}</span>
            </button>
          </div>
        </MobileSheet>
      )}
    </>
  );
}
