import { useTranslation } from 'react-i18next';

import { cn, Skeleton } from '@knowtis/design-system';

import {
  WORKSPACE_TAB,
  WORKSPACE_TAB_LINE_BOX,
  WORKSPACE_TAB_STRIP,
} from './workspace-tab.styles';

const LABEL_WIDTHS = ['w-10', 'w-14'] as const;

export function WorkspaceTabBarSkeleton() {
  const { t } = useTranslation('notes');

  return (
    <div
      role="status"
      aria-label={t('workspace.tabsLoading')}
      className={WORKSPACE_TAB_STRIP}
    >
      {LABEL_WIDTHS.map((width) => (
        <div key={width} className={cn(WORKSPACE_TAB, 'border-transparent')}>
          <span className={WORKSPACE_TAB_LINE_BOX}>
            <Skeleton className="size-4 rounded" />
            <Skeleton className={cn('h-3.5', width)} />
          </span>
        </div>
      ))}
    </div>
  );
}
