import { NAVIGATION_LINKS } from '@/config/navigation.config';
import { useAuthUser } from '@jovandyaz/auth-react';
import { motion } from 'motion/react';

import { NavigationLinks } from './NavigationLinks';
import { SidebarBrand } from './SidebarBrand';
import { SidebarFlashcardsSection } from './SidebarFlashcardsSection';
import { SidebarNotesSection } from './SidebarNotesSection';
import { SidebarUserMenu } from './SidebarUserMenu';

export function Sidebar() {
  const user = useAuthUser();

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="hidden md:flex w-56 flex-col fixed inset-y-0 left-0 z-40 border-r border-border/40 bg-background/40 backdrop-blur-xl"
    >
      <SidebarBrand />
      <NavigationLinks links={NAVIGATION_LINKS} />
      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-4">
        <SidebarNotesSection />
        <SidebarFlashcardsSection />
      </div>
      <SidebarUserMenu username={user?.name ?? ''} />
    </motion.aside>
  );
}
