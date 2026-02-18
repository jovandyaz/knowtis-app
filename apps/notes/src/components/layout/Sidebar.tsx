import { useState } from 'react';

import { NAVIGATION_LINKS } from '@/config/navigation.config';
import { useAuthUser } from '@jovandyaz/auth-react';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@knowtis/design-system';

import { NavigationLinks } from './NavigationLinks';
import { SidebarBrand } from './SidebarBrand';
import { SidebarUserFooter } from './SidebarUserFooter';

export function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const user = useAuthUser();

  const closeMobileMenu = () => setIsMobileOpen(false);

  return (
    <>
      <div className="fixed left-4 top-4 z-50 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="h-10 w-10 rounded-full bg-(--background)/80 shadow-sm backdrop-blur-md"
          aria-label="Toggle menu"
        >
          {isMobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </div>

      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="hidden md:flex w-56 flex-col fixed inset-y-0 left-0 z-40 border-r border-border/40 bg-background/40 backdrop-blur-xl"
      >
        <SidebarBrand />
        <NavigationLinks links={NAVIGATION_LINKS} />
        <SidebarUserFooter username={user?.name ?? ''} />
      </motion.aside>

      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMobileMenu}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden cursor-pointer"
            />

            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs flex flex-col bg-background/95 backdrop-blur-2xl border-r border-border md:hidden"
            >
              <SidebarBrand onClick={closeMobileMenu} />
              <NavigationLinks
                links={NAVIGATION_LINKS}
                onLinkClick={closeMobileMenu}
              />
              <SidebarUserFooter username={user?.name ?? ''} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
