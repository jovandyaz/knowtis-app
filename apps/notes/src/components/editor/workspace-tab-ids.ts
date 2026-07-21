import type { WorkspaceTab } from '@/stores/workspace.store';

export const WORKSPACE_ID_BASE = 'workspace';

export const workspaceTabId = (tab: WorkspaceTab): string =>
  `${WORKSPACE_ID_BASE}-tab-${tab}`;

export const workspacePanelId = (tab: WorkspaceTab): string =>
  `${WORKSPACE_ID_BASE}-panel-${tab}`;
