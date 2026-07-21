import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceStore, type WorkspaceTab } from '@/stores/workspace.store';
import { BookOpen, FileText, type LucideIcon } from 'lucide-react';

import { useArtifacts } from '@knowtis/data-access-artifacts';
import { cn } from '@knowtis/design-system';

import { workspacePanelId, workspaceTabId } from './workspace-tab-ids';

interface WorkspaceTabItem {
  value: WorkspaceTab;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export function WorkspaceTabBar({ noteId }: { noteId: string }) {
  const { t } = useTranslation('notes');
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const { data: artifacts } = useArtifacts(noteId);

  const tabs: WorkspaceTabItem[] = [
    { value: 'note', label: t('workspace.tabs.note'), icon: FileText },
    {
      value: 'estudio',
      label: t('workspace.tabs.study'),
      icon: BookOpen,
      count: artifacts?.length ?? 0,
    },
  ];

  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusTab = (tab: WorkspaceTab) => {
    setTab(tab);
    buttons.current[tab]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.value === activeTab);
    if (index === -1) {
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusTab(tabs[(index + 1) % tabs.length].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusTab(tabs[(index - 1 + tabs.length) % tabs.length].value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTab(tabs[0].value);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTab(tabs[tabs.length - 1].value);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={t('workspace.tabsLabel')}
      className="mb-6 flex items-center gap-6 border-b border-border/60"
    >
      {tabs.map(({ value, label, icon: Icon, count }) => {
        const selected = value === activeTab;
        return (
          <button
            key={value}
            ref={(el) => {
              buttons.current[value] = el;
            }}
            id={workspaceTabId(value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={workspacePanelId(value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={onKeyDown}
            className={cn(
              '-mb-px flex items-center gap-2 rounded-t-sm border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-medium',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2',
              selected
                ? 'border-(--primary) text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {count != null && count > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-(--primary)/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-(--primary)">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
