import { useState } from 'react';

import { AppShellAccount } from '@/components/AppShellAccount';
import { AppShellNav } from '@/components/AppShellNav';
import { APP_NAME } from '@/config/app.config';
import { Menu } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';

/**
 * Phone chrome for {@link AppShell}: a sticky bar plus the nav sheet it opens.
 * The sheet's open state is owned here so leaving the phone branch discards it.
 */
export function AppShellMobileNav() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-(--app-bar-height) shrink-0 items-center justify-between border-b border-(--border) bg-(--background) px-4">
        <span className="text-sm font-semibold">{APP_NAME}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 h-11 w-11"
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>
      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Navigation</DialogTitle>
          </DialogHeader>
          <AppShellNav onNavigate={() => setNavOpen(false)} />
          <AppShellAccount />
        </DialogContent>
      </Dialog>
    </>
  );
}
