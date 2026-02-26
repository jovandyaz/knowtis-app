import { useTranslation } from 'react-i18next';

import { useRouter } from '@tanstack/react-router';

import { useSettingsStore } from '@/stores/settings.store';
import { FileText, Home, Settings } from 'lucide-react';

import { cn } from '@knowtis/design-system';

const NOTE_EDITOR_PATTERN = /^\/notes\/[^/]+$/;

interface BottomNavTab {
  icon: typeof Home;
  labelKey: 'labels.home' | 'labels.notes' | 'settings.title';
  to?: string;
  action?: () => void;
}

export function BottomNav() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentPath = router.state.location.pathname;
  const openSettings = useSettingsStore((s) => s.open);

  if (NOTE_EDITOR_PATTERN.test(currentPath)) {
    return null;
  }

  const tabs: BottomNavTab[] = [
    { icon: Home, labelKey: 'labels.home', to: '/' },
    { icon: FileText, labelKey: 'labels.notes', to: '/notes' },
    {
      icon: Settings,
      labelKey: 'settings.title',
      action: () => openSettings(),
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
                'flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] px-3 py-1 rounded-xl transition-colors',
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
  );
}
