import type { ReactNode } from 'react';

import { useWorkspaceStore, type WorkspaceTab } from '@/stores/workspace.store';

import { cn } from '@knowtis/design-system';

import { workspacePanelId, workspaceTabId } from './workspace-tab-ids';

interface WorkspaceTabPanelProps {
  tab: WorkspaceTab;
  tabbed: boolean;
  children: ReactNode;
}

export function WorkspaceTabPanel({
  tab,
  tabbed,
  children,
}: WorkspaceTabPanelProps) {
  const activeTab = useWorkspaceStore((s) => s.activeTab);

  return (
    <div
      {...(tabbed
        ? {
            id: workspacePanelId(tab),
            role: 'tabpanel' as const,
            'aria-labelledby': workspaceTabId(tab),
            tabIndex: 0,
          }
        : {})}
      className={cn(tabbed && activeTab !== tab && 'hidden')}
    >
      {children}
    </div>
  );
}
