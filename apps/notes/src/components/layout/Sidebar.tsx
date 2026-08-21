import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { BucketNav } from '@/components/organization/BucketNav';
import { SupertagNav } from '@/components/organization/SupertagNav';
import { TagTree } from '@/components/organization/TagTree';
import { NAVIGATION_LINKS, ROUTES } from '@/config';
import { useNotesSearchStore } from '@/stores/notes-search.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { Search } from 'lucide-react';

import { ResizablePanel } from '@knowtis/design-system';

import { NavigationLinks } from './NavigationLinks';
import { SidebarBrand } from './SidebarBrand';
import { SidebarNotesSection } from './SidebarNotesSection';
import { SidebarUserMenu } from './SidebarUserMenu';

const isMac =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

const SIDEBAR_WIDTH = 224;
const COLLAPSE_THRESHOLD = 80;

export function Sidebar() {
  const user = useAuthUser();
  const isAnonymous = user?.isAnonymous ?? false;
  const { t } = useTranslation('common');
  const collapsed = useSidebarStore((s) => s.collapsed);
  const setCollapsed = useSidebarStore((s) => s.setCollapsed);
  const setStoreWidth = useSidebarStore((s) => s.setWidth);
  const { requestFocus } = useNotesSearchStore();
  const navigate = useNavigate();

  const handleCollapse = useCallback(() => setCollapsed(true), [setCollapsed]);

  const openSearch = useCallback(async () => {
    await navigate({ to: ROUTES.NOTES });
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
    <ResizablePanel
      side="left"
      defaultWidth={SIDEBAR_WIDTH}
      minWidth={SIDEBAR_WIDTH}
      maxWidth={SIDEBAR_WIDTH}
      collapseThreshold={COLLAPSE_THRESHOLD}
      isOpen={!collapsed}
      onCollapse={handleCollapse}
      onWidthChange={setStoreWidth}
      handleAriaLabel={t('labels.resizeSidebar', 'Resize sidebar')}
      className="hidden md:flex flex-col fixed inset-y-0 left-0 z-40 border-r border-border/40 bg-background/40 backdrop-blur-xl"
    >
      <div
        className="flex flex-col h-full min-w-0"
        style={{ width: `${SIDEBAR_WIDTH}px` }}
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
          {!isAnonymous && <BucketNav />}
          {!isAnonymous && <SupertagNav />}
          {!isAnonymous && <TagTree />}
          <SidebarNotesSection />
        </div>
        <SidebarUserMenu
          username={user?.name ?? ''}
          isAnonymous={isAnonymous}
        />
      </div>
    </ResizablePanel>
  );
}
