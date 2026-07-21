import { useTranslation } from 'react-i18next';

import { useWorkspaceStore, type WorkspaceTab } from '@/stores/workspace.store';
import { BookOpen, FileText } from 'lucide-react';

import { useArtifacts } from '@knowtis/data-access-artifacts';
import {
  cn,
  SegmentedControl,
  type SegmentedControlItem,
} from '@knowtis/design-system';

export function WorkspaceTabBar({ noteId }: { noteId: string }) {
  const { t } = useTranslation('notes');
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const { data: artifacts } = useArtifacts(noteId);
  const count = artifacts?.length ?? 0;

  const studyLabel = (
    <span className="flex items-center gap-1.5">
      {t('ai.artifacts.studyTools')}
      {count > 0 && (
        <span
          className={cn(
            'inline-flex min-w-4 items-center justify-center rounded-full px-1',
            'bg-(--primary)/15 text-(--primary) text-[10px] font-semibold leading-none'
          )}
        >
          {count}
        </span>
      )}
    </span>
  );

  const items: SegmentedControlItem[] = [
    {
      value: 'note',
      label: t('workspace.tabs.note'),
      icon: FileText,
    },
    { value: 'estudio', label: studyLabel, icon: BookOpen },
  ];

  return (
    <SegmentedControl
      idBase="workspace"
      ariaLabel={t('workspace.tabsLabel')}
      value={activeTab}
      onValueChange={(v) => setTab(v as WorkspaceTab)}
      items={items}
      className="mb-4 w-full max-w-xs"
    />
  );
}
