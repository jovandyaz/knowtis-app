import { NAVIGATION_LINKS } from '@/config/navigation.config';
import { useSidebarStore } from '@/stores/sidebar.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { NavigationLinks } from './NavigationLinks';
import { SidebarBrand } from './SidebarBrand';
import { SidebarFlashcardsSection } from './SidebarFlashcardsSection';
import { SidebarNotesSection } from './SidebarNotesSection';
import { SidebarUserMenu } from './SidebarUserMenu';

export function Sidebar() {
  const user = useAuthUser();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);

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
            <div className="flex items-center justify-between pr-2">
              <SidebarBrand />
              <button
                type="button"
                onClick={toggle}
                className="p-1.5 rounded-md text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted)/50 transition-colors cursor-pointer"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <NavigationLinks links={NAVIGATION_LINKS} />
            <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-4">
              <SidebarNotesSection />
              <SidebarFlashcardsSection />
            </div>
            <SidebarUserMenu
              username={user?.name ?? ''}
              isAnonymous={user?.isAnonymous ?? false}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Collapsed toggle button */}
      {collapsed && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          type="button"
          onClick={toggle}
          className="hidden md:flex fixed top-4 left-4 z-40 p-2 rounded-md text-(--muted-foreground) hover:text-(--foreground) hover:bg-(--muted)/50 transition-colors cursor-pointer"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </motion.button>
      )}
    </>
  );
}
