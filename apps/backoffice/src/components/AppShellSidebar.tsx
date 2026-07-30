import { AppShellAccount } from '@/components/AppShellAccount';
import { AppShellNav } from '@/components/AppShellNav';
import { APP_NAME } from '@/config/app.config';

export function AppShellSidebar() {
  return (
    <aside className="flex w-56 flex-col border-r border-(--border) p-4">
      <span className="mb-6 text-sm font-semibold">{APP_NAME}</span>
      <AppShellNav className="flex-1" />
      <AppShellAccount />
    </aside>
  );
}
