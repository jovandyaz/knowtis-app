import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { isStudyFocusOpen } from '@/components/artifacts/focus/study-focus-marker';
import { BucketNav } from '@/components/organization/BucketNav';
import { NAV_ICON_SLOT } from '@/components/organization/nav-row.styles';
import { SupertagNav } from '@/components/organization/SupertagNav';
import { TagTree } from '@/components/organization/TagTree';
import { NAVIGATION_LINKS } from '@/config/navigation.config';
import { ROUTES } from '@/config/routes.config';
import { useNotesSearchStore } from '@/stores/notes-search.store';
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarPreferenceStore,
} from '@/stores/sidebar-preference.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { Search } from 'lucide-react';

import { Button, Kbd, ResizablePanel } from '@knowtis/design-system';
import { useCollapseFocusReturn } from '@knowtis/shared-hooks';
import { formatShortcut, isMacPlatform } from '@knowtis/shared-util';

import { NavigationLinks } from './NavigationLinks';
import { SidebarBrand } from './SidebarBrand';
import { SidebarNotesSection } from './SidebarNotesSection';
import { SidebarUserMenu } from './SidebarUserMenu';

const COLLAPSE_THRESHOLD = 80;
const TOGGLE_ID = 'sidebar-toggle';

/** Layout offset of the main column. Written on every drag frame, so it must
 *  stay out of React state: a re-render there re-renders the whole app. */
export const APP_SIDEBAR_WIDTH_VAR = '--app-sidebar-width';

export function Sidebar() {
  const isMac = isMacPlatform();
  const user = useAuthUser();
  const isAnonymous = user?.isAnonymous ?? false;
  const { t } = useTranslation('common');
  const collapsed = useSidebarStore((s) => s.collapsed);
  const setCollapsed = useSidebarStore((s) => s.setCollapsed);
  const setVisibleWidth = useSidebarStore((s) => s.setVisibleWidth);
  const preferredWidth = useSidebarPreferenceStore((s) => s.preferredWidth);
  const setPreferredWidth = useSidebarPreferenceStore(
    (s) => s.setPreferredWidth
  );
  const { requestFocus } = useNotesSearchStore();
  const navigate = useNavigate();

  const panelRef = useRef<HTMLElement>(null);

  const publishLayoutWidth = useCallback((width: number) => {
    document.documentElement.style.setProperty(
      APP_SIDEBAR_WIDTH_VAR,
      `${width}px`
    );
  }, []);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty(APP_SIDEBAR_WIDTH_VAR);
    };
  }, []);

  // The dock reads this width to pick its presentation, so publishing it after
  // the first paint would flash the wrong one on a narrow window.
  useLayoutEffect(() => {
    setVisibleWidth(collapsed ? 0 : preferredWidth);
  }, [collapsed, preferredWidth, setVisibleWidth]);

  const returnFocusToToggle = useCollapseFocusReturn(panelRef, TOGGLE_ID);
  const handleCollapse = useCallback(() => {
    returnFocusToToggle();
    setCollapsed(true);
  }, [returnFocusToToggle, setCollapsed]);

  const openSearch = useCallback(async () => {
    await navigate({ to: ROUTES.NOTES, search: { view: 'all' } });
    requestFocus();
  }, [navigate, requestFocus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const hasPlatformModifier = isMac
        ? e.metaKey && !e.ctrlKey
        : e.ctrlKey && !e.metaKey;
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.altKey ||
        e.shiftKey ||
        !hasPlatformModifier ||
        e.key.toLowerCase() !== 'k'
      ) {
        return;
      }
      if (isStudyFocusOpen()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      void openSearch();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMac, openSearch]);

  return (
    <ResizablePanel
      ref={panelRef}
      side="left"
      defaultWidth={preferredWidth}
      minWidth={SIDEBAR_MIN_WIDTH}
      maxWidth={SIDEBAR_MAX_WIDTH}
      collapseThreshold={COLLAPSE_THRESHOLD}
      isOpen={!collapsed}
      onCollapse={handleCollapse}
      onWidthChange={publishLayoutWidth}
      onResizeEnd={setPreferredWidth}
      handleAriaLabel={t('labels.resizeSidebar', 'Resize sidebar')}
      className="hidden md:flex flex-col fixed inset-y-0 left-0 z-40 bg-background"
    >
      <div className="flex h-full w-full min-w-0 flex-col">
        <SidebarBrand />
        <NavigationLinks links={NAVIGATION_LINKS} />
        <div className="px-3 mb-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void openSearch()}
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            className="w-full min-h-9 justify-between px-2 text-sm text-foreground bg-muted/50 hover:bg-muted"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className={NAV_ICON_SLOT} aria-hidden>
                <Search className="h-4 w-4" />
              </span>
              <span className="truncate">{t('labels.searchNotes')}</span>
            </span>
            <Kbd className="shrink-0">{formatShortcut('Mod+K')}</Kbd>
          </Button>
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 py-2 flex flex-col gap-4">
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
