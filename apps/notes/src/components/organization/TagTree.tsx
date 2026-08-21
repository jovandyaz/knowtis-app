import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, useLocation, useSearch } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { ChevronDown, ChevronRight, Hash } from 'lucide-react';

import { useTags } from '@knowtis/data-access-notes';

import { buildTagTree, type TagTreeItem } from './tag-tree.utils';

const INDENT_PER_DEPTH_REM = 0.75;

interface TagTreeProps {
  onNavigate?: () => void;
}

export function TagTree({ onNavigate }: TagTreeProps) {
  const { t } = useTranslation('notes');
  const { data: tags } = useTags();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as { tag?: string };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!tags?.length) {
    return null;
  }

  const toggle = (path: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });

  const activeTag = pathname === ROUTES.NOTES ? search.tag : undefined;

  const renderItem = (item: TagTreeItem): React.ReactNode => {
    const isCollapsed = collapsed.has(item.path);
    const hasChildren = item.children.length > 0;

    return (
      <div key={item.path} className="flex flex-col gap-0.5">
        <div
          className="flex items-center gap-1"
          style={{ paddingLeft: `${item.depth * INDENT_PER_DEPTH_REM}rem` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(item.path)}
              aria-expanded={!isCollapsed}
              aria-label={t(
                isCollapsed
                  ? 'organization.tags.expand'
                  : 'organization.tags.collapse',
                { tag: item.path }
              )}
              className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground cursor-pointer"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-4" aria-hidden />
          )}

          <Link
            to={ROUTES.NOTES}
            search={{ tag: item.path, view: 'all' }}
            onClick={onNavigate}
            activeProps={{}}
            inactiveProps={{}}
            aria-current={activeTag === item.path ? 'page' : undefined}
            className={`flex min-h-8 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors cursor-pointer ${
              activeTag === item.path
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
            }`}
          >
            <Hash
              className="h-3 w-3 shrink-0"
              style={item.color ? { color: item.color } : undefined}
            />
            <span className="flex-1 truncate">{item.label}</span>
            {item.noteCount > 0 && (
              <span className="text-xs text-muted-foreground/60">
                {item.noteCount}
              </span>
            )}
          </Link>
        </div>

        {hasChildren && !isCollapsed && item.children.map(renderItem)}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {t('organization.tagsTitle')}
      </span>
      <div className="flex flex-col gap-0.5">
        {buildTagTree(tags).map(renderItem)}
      </div>
    </div>
  );
}
