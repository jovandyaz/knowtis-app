import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { FileText, Home, LogIn, Settings, UserPlus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

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
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const openSettings = useSettingsStore((s) => s.open);
  const user = useAuthUser();
  const isAnonymous = user?.isAnonymous ?? false;
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);

  if (NOTE_EDITOR_PATTERN.test(currentPath)) {
    return null;
  }

  const tabs: BottomNavTab[] = [
    { icon: Home, labelKey: 'labels.home', to: ROUTES.DASHBOARD },
    { icon: FileText, labelKey: 'labels.notes', to: ROUTES.NOTES },
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

      {isAnonymous &&
        createPortal(
          <AnimatePresence>
            {isAccountSheetOpen && (
              <>
                <motion.div
                  key="sheet-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                  onClick={() => setIsAccountSheetOpen(false)}
                />
                <motion.div
                  key="sheet-content"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-(--border) bg-(--background) pb-[env(safe-area-inset-bottom)]"
                >
                  <div className="flex items-center justify-between px-5 pt-5 pb-4">
                    <div className="h-1 w-10 rounded-full bg-(--muted-foreground)/30 mx-auto" />
                  </div>

                  <div className="px-5 pb-6 space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAccountSheetOpen(false);
                        void navigate({ to: ROUTES.REGISTER });
                      }}
                      className="flex w-full items-center gap-3 rounded-xl bg-(--primary)/10 px-4 py-3.5 text-(--primary) transition-colors active:bg-(--primary)/20"
                    >
                      <UserPlus className="h-5 w-5 shrink-0" />
                      <span className="font-medium">
                        {t('nav.createAccount')}
                      </span>
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

                  <button
                    type="button"
                    onClick={() => setIsAccountSheetOpen(false)}
                    className="absolute right-4 top-4 rounded-full p-1.5 text-(--muted-foreground)/50 transition-colors active:text-(--muted-foreground)"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
