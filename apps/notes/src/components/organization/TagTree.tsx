import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { ChevronDown, ChevronRight, Hash } from 'lucide-react';
import { toast } from 'sonner';

import { useTags, useUpdateTag } from '@knowtis/data-access-notes';
import {
  isWithinBranch,
  TAG_PATH_SEPARATOR,
  type TagNode,
} from '@knowtis/shared-types';

import { DeleteTagDialog } from './DeleteTagDialog';
import {
  NAV_COUNT,
  NAV_ICON_SLOT,
  NAV_LABEL,
  NAV_ROW,
  NAV_ROW_ACTIVE,
  NAV_ROW_IDLE,
} from './nav-row.styles';
import { tagSwatchClass, tagTextClass } from './tag-colors';
import { buildTagTree, type TagTreeItem } from './tag-tree.utils';
import { TagActionsMenu } from './TagActionsMenu';
import { TagRenameInput } from './TagRenameInput';

const INDENT_PER_DEPTH_REM = 0.75;

function parentOf(path: string): string {
  return path.split(TAG_PATH_SEPARATOR).slice(0, -1).join(TAG_PATH_SEPARATOR);
}

/** The last segment of every tag sharing a parent with `path`, excluding itself. */
function siblingSegmentsOf(tags: TagNode[], path: string): string[] {
  const parent = parentOf(path);
  return tags
    .filter((tag) => tag.path !== path && parentOf(tag.path) === parent)
    .map((tag) => tag.path.split(TAG_PATH_SEPARATOR).at(-1) as string);
}

interface TagTreeProps {
  onNavigate?: () => void;
}

export function TagTree({ onNavigate }: TagTreeProps) {
  const { t } = useTranslation('notes');
  const { data: tags } = useTags();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as { tag?: string };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<TagTreeItem>();
  const updateTag = useUpdateTag();

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

  /** Keeps the list in step when the branch it is filtered by moves or goes. */
  const followFilter = (branch: string, nextPath?: string) => {
    if (!activeTag || !isWithinBranch(activeTag, branch)) {
      return;
    }
    const tag = nextPath
      ? `${nextPath}${activeTag.slice(branch.length)}`
      : undefined;
    navigate({
      to: ROUTES.NOTES,
      search: { view: 'all', ...(tag && { tag }) },
    });
  };

  const handleRename = (item: TagTreeItem, segment: string) => {
    const parent = parentOf(item.path);
    const nextPath = parent
      ? `${parent}${TAG_PATH_SEPARATOR}${segment}`
      : segment;

    setRenamingId(undefined);
    updateTag.mutate(
      { id: item.id, input: { path: nextPath } },
      {
        onSuccess: () => followFilter(item.path, nextPath),
        onError: () => toast.error(t('organization.tags.renameError')),
      }
    );
  };

  const renderItem = (item: TagTreeItem): React.ReactNode => {
    const isCollapsed = collapsed.has(item.path);
    const hasChildren = item.children.length > 0;

    const isActive = activeTag === item.path;
    const isRenaming = renamingId === item.id;
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    return (
      <div key={item.path} className="flex flex-col gap-0.5">
        <div
          className={`${NAV_ROW} group/tag relative has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-(--ring) ${
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
              <Hash className={`h-3 w-3 ${tagTextClass(item.color) ?? ''}`} />
            </span>
          )}

          {hasChildren && item.color && (
            <span
              aria-hidden
              className={`size-[7px] shrink-0 rounded-full ${tagSwatchClass(
                item.color
              )}`}
            />
          )}

          {isRenaming ? (
            <TagRenameInput
              segment={item.label}
              siblings={siblingSegmentsOf(tags, item.path)}
              onCommit={(segment) => handleRename(item, segment)}
              onCancel={() => setRenamingId(undefined)}
            />
          ) : (
            <>
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

              <div className="relative z-10 opacity-100 transition-opacity md:opacity-0 md:group-hover/tag:opacity-100 md:group-focus-within/tag:opacity-100">
                <TagActionsMenu
                  tagId={item.id}
                  path={item.path}
                  color={item.color}
                  onRenameRequest={() => setRenamingId(item.id)}
                  onDeleteRequest={() => setPendingDelete(item)}
                />
              </div>
            </>
          )}
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

      {pendingDelete && (
        <DeleteTagDialog
          tagId={pendingDelete.id}
          path={pendingDelete.path}
          open
          onOpenChange={(open) => !open && setPendingDelete(undefined)}
          onDeleted={() => {
            followFilter(pendingDelete.path);
            setPendingDelete(undefined);
          }}
        />
      )}
    </div>
  );
}
