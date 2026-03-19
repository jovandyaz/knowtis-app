import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { NAVIGATION_LINKS } from '@/config/navigation.config';
import { useNotesSearchStore } from '@/stores/notes-search.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { NavigationLinks } from './NavigationLinks';
import { SidebarBrand } from './SidebarBrand';
import { SidebarNotesSection } from './SidebarNotesSection';
import { SidebarUserMenu } from './SidebarUserMenu';

const isMac =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

export function Sidebar() {
  const user = useAuthUser();
  const { t } = useTranslation('common');
  const collapsed = useSidebarStore((s) => s.collapsed);
  const { requestFocus } = useNotesSearchStore();
  const navigate = useNavigate();

  const openSearch = useCallback(async () => {
    await navigate({ to: '/notes' });
    requestFocus();
  }, [navigate, requestFocus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        void openSearch();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openSearch]);

  return (
    <>
      <AnimatePresence>
        {!collapsed && (
          <motion.aside
            initial={{ x: -224, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -224, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="hidden md:flex w-56 flex-col fixed inset-y-0 left-0 z-40 border-r border-border/40 bg-background/40 backdrop-blur-xl"
          >
            <div className="flex items-center">
              <SidebarBrand />
            </div>
            <NavigationLinks links={NAVIGATION_LINKS} />
            <div className="px-3 mb-3">
              <button
                type="button"
                onClick={() => void openSearch()}
                className="w-full flex items-center justify-between rounded-lg px-3 py-1.5 border border-border/30 bg-muted/20 hover:bg-muted/40 transition-colors text-muted-foreground/50 hover:text-muted-foreground cursor-pointer"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Search className="h-3.5 w-3.5" />
                  {t('labels.search')}
                </span>
                <kbd className="text-[10px] font-mono bg-muted/40 px-1.5 py-0.5 rounded border border-border/30 leading-none">
                  {isMac ? '⌘ K' : 'Ctrl + K'}
                </kbd>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-4">
              <SidebarNotesSection />
            </div>
            <SidebarUserMenu
              username={user?.name ?? ''}
              isAnonymous={user?.isAnonymous ?? false}
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
