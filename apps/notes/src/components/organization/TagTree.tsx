import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, useLocation, useSearch } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { ChevronDown, ChevronRight, Hash } from 'lucide-react';

import { useTags } from '@knowtis/data-access-notes';

import {
  NAV_COUNT,
  NAV_ICON_SLOT,
  NAV_LABEL,
  NAV_ROW,
  NAV_ROW_ACTIVE,
  NAV_ROW_IDLE,
} from './nav-row.styles';
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

    const isActive = activeTag === item.path;
    const tint = item.color ? { color: item.color } : undefined;
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    return (
      <div key={item.path} className="flex flex-col gap-0.5">
        <div
          className={`${NAV_ROW} relative has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-(--ring) ${
            isActive ? NAV_ROW_ACTIVE : NAV_ROW_IDLE
          }`}
          style={{ marginLeft: `${item.depth * INDENT_PER_DEPTH_REM}rem` }}
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
              className={`${NAV_ICON_SLOT} relative z-10 cursor-pointer after:absolute after:-inset-x-2 after:-inset-y-4 after:content-[''] md:after:-inset-x-1 md:after:-inset-y-1`}
            >
              <Chevron className="h-3 w-3" />
            </button>
          ) : (
            <span className={NAV_ICON_SLOT} aria-hidden>
              <Hash className="h-3 w-3" style={tint} />
            </span>
          )}

          <Link
            to={ROUTES.NOTES}
            search={{ tag: item.path, view: 'all' }}
            onClick={onNavigate}
            activeProps={{}}
            inactiveProps={{}}
            aria-current={isActive ? 'page' : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            <span className={NAV_LABEL}>{item.label}</span>
            {item.noteCount > 0 && (
              <span className={NAV_COUNT}>{item.noteCount}</span>
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
