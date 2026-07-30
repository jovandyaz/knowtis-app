import { useState, type ReactNode } from 'react';

import { AppShellAccount } from '@/components/AppShellAccount';
import { AppShellNav } from '@/components/AppShellNav';
import { Menu } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';

const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';
const APP_NAME = 'Knowtis Backoffice';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {isDesktop ? (
        <aside className="flex w-56 flex-col border-r border-(--border) p-4">
          <span className="mb-6 text-sm font-semibold">{APP_NAME}</span>
          <AppShellNav className="flex-1" />
          <AppShellAccount className="border-t border-(--border) pt-4" />
        </aside>
      ) : (
        <>
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-(--border) bg-(--background) px-4">
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
              <AppShellAccount className="border-t border-(--border) pt-4" />
            </DialogContent>
          </Dialog>
        </>
      )}
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
