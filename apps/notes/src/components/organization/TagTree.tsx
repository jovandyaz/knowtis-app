import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';

import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';

import { ROUTES, STORAGE_KEYS } from '@/config';
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
import { SidebarSection } from './SidebarSection';
import { tagSwatchClass, tagTextClass } from './tag-colors';
import { buildTagTree, type TagTreeItem } from './tag-tree.utils';
import { TagActionsMenu } from './TagActionsMenu';
import { TagRenameInput, type RenameExit } from './TagRenameInput';

const INDENT_PER_DEPTH_REM = 0.75;
const TABBABLE_CANDIDATES =
  'a[href], button, input, select, textarea, [tabindex]';
const SCROLLING_OVERFLOW = ['auto', 'scroll'];

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

/** Rows in render order, skipping what a collapsed branch hides. */
function visibleRows(
  items: TagTreeItem[],
  collapsed: Set<string>
): TagTreeItem[] {
  return items.flatMap((item) => [
    item,
    ...(collapsed.has(item.path) ? [] : visibleRows(item.children, collapsed)),
  ]);
}

/** Ids of the other rows, nearest first: every row below, then every row above. */
function neighbourIdsOf(rows: TagTreeItem[], item: TagTreeItem): string[] {
  const index = rows.indexOf(item);
  return [...rows.slice(index + 1), ...rows.slice(0, index).reverse()].map(
    (row) => row.id
  );
}

function scrollRegionOf(element: HTMLElement): HTMLElement {
  let region = element.parentElement;
  while (
    region &&
    !SCROLLING_OVERFLOW.includes(getComputedStyle(region).overflowY)
  ) {
    region = region.parentElement;
  }
  return region ?? document.body;
}

function isTabbable(element: HTMLElement): boolean {
  return (
    element.tabIndex >= 0 &&
    !element.matches(':disabled') &&
    (typeof element.checkVisibility !== 'function' || element.checkVisibility())
  );
}

/** The tabbable element nearest `root` in its scroll region: the first after it, else the last before it. */
function tabbableAround(root: HTMLElement): HTMLElement | undefined {
  const outside = Array.from(
    scrollRegionOf(root).querySelectorAll<HTMLElement>(TABBABLE_CANDIDATES)
  ).filter((element) => !root.contains(element) && isTabbable(element));
  const follows = (element: HTMLElement) =>
    Boolean(
      root.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  return (
    outside.find(follows) ?? outside.findLast((element) => !follows(element))
  );
}

interface PendingDelete {
  item: TagTreeItem;
  neighbourIds: string[];
  outsideTree: HTMLElement | undefined;
}

interface TagTreeProps {
  onNavigate?: () => void;
}

export function TagTree({ onNavigate }: TagTreeProps) {
  const { t } = useTranslation('notes');
  const { data: tags = [] } = useTags();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as { tag?: string };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>();
  const updateTag = useUpdateTag();
  const triggersRef = useRef(new Map<string, HTMLButtonElement>());
  const rootRef = useRef<HTMLDivElement>(null);

  const activeTag = pathname === ROUTES.NOTES ? search.tag : undefined;
  // A mutation settles a round trip later, by which time the reader may have
  // filtered by something else; the closure must not drag them back.
  const activeTagRef = useRef(activeTag);
  useEffect(() => {
    activeTagRef.current = activeTag;
  }, [activeTag]);

  const tree = buildTagTree(tags);

  const registerTrigger =
    (id: string) => (trigger: HTMLButtonElement | null) => {
      if (!trigger) {
        return;
      }
      triggersRef.current.set(id, trigger);
      return () => {
        triggersRef.current.delete(id);
      };
    };

  const toggle = (path: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });

  /** Keeps the list in step when the branch it is filtered by moves or goes. */
  const followFilter = (branch: string, nextPath?: string) => {
    const filtered = activeTagRef.current;
    if (!filtered || !isWithinBranch(filtered, branch)) {
      return;
    }
    const tag = nextPath
      ? `${nextPath}${filtered.slice(branch.length)}`
      : undefined;
    navigate({
      to: ROUTES.NOTES,
      search: { view: 'all', ...(tag && { tag }) },
    });
  };

  const closeRename = (item: TagTreeItem, exit: RenameExit) => {
    flushSync(() => setRenamingId(undefined));
    if (exit === 'keyboard') {
      triggersRef.current.get(item.id)?.focus();
    }
  };

  const handleRename = (
    item: TagTreeItem,
    segment: string,
    exit: RenameExit
  ) => {
    const parent = parentOf(item.path);
    const nextPath = parent
      ? `${parent}${TAG_PATH_SEPARATOR}${segment}`
      : segment;

    closeRename(item, exit);
    updateTag.mutate(
      { id: item.id, input: { path: nextPath } },
      {
        onSuccess: () => followFilter(item.path, nextPath),
        onError: () => toast.error(t('organization.tags.renameError')),
      }
    );
  };

  const handleDeleteCloseAutoFocus = (
    event: Event,
    { item, neighbourIds, outsideTree }: PendingDelete
  ) => {
    const target =
      [item.id, ...neighbourIds]
        .map((id) => triggersRef.current.get(id))
        .find((trigger) => trigger?.isConnected) ??
      (outsideTree?.isConnected ? outsideTree : undefined);
    if (!target) {
      return;
    }
    // The dialog's opener was a menu item that closed with its menu, so it has nothing to restore.
    event.preventDefault();
    target.focus();
  };

  const renderItem = (item: TagTreeItem): React.ReactNode => {
    const isCollapsed = collapsed.has(item.path);
    const hasChildren = item.children.length > 0;

    const isActive = activeTag === item.path;
    const isRenaming = renamingId === item.id;
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;

    return (
      <div key={item.id} className="flex flex-col gap-0.5">
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
              <Chevron className="h-4 w-4" />
            </button>
          ) : (
            <span className={NAV_ICON_SLOT} aria-hidden>
              <Hash className={`h-4 w-4 ${tagTextClass(item.color) ?? ''}`} />
            </span>
          )}

          {isRenaming ? (
            <TagRenameInput
              segment={item.label}
              siblings={siblingSegmentsOf(tags, item.path)}
              onCommit={(segment, exit) => handleRename(item, segment, exit)}
              onCancel={(exit) => closeRename(item, exit)}
            />
          ) : (
            <>
              <Link
                to={ROUTES.NOTES}
                search={{ tag: item.path, view: 'all' }}
                onClick={onNavigate}
                activeProps={{}}
                aria-current={isActive ? 'page' : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
              >
                <span className={NAV_LABEL}>{item.label}</span>
                {(item.noteCount > 0 || (hasChildren && item.color)) && (
                  <span className="flex shrink-0 items-center gap-2">
                    {hasChildren && item.color && (
                      <span
                        aria-hidden
                        className={`size-[7px] shrink-0 rounded-full ${tagSwatchClass(item.color)}`}
                      />
                    )}
                    {item.noteCount > 0 && (
                      <span className={NAV_COUNT}>{item.noteCount}</span>
                    )}
                  </span>
                )}
              </Link>

              <div className="relative z-10 flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-hover/tag:opacity-100 md:group-focus-within/tag:opacity-100">
                <TagActionsMenu
                  tagId={item.id}
                  path={item.path}
                  color={item.color}
                  triggerClassName="size-11 md:size-6"
                  triggerRef={registerTrigger(item.id)}
                  onRenameRequest={() => setRenamingId(item.id)}
                  onDeleteRequest={() =>
                    setPendingDelete({
                      item,
                      neighbourIds: neighbourIdsOf(
                        visibleRows(tree, collapsed),
                        item
                      ),
                      // Deleting the last tag unmounts this root before the dialog closes, so it cannot be walked later.
                      outsideTree: rootRef.current
                        ? tabbableAround(rootRef.current)
                        : undefined,
                    })
                  }
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
    <>
      {tags.length > 0 && (
        <div ref={rootRef} className="contents">
          <SidebarSection
            title={t('organization.tagsTitle')}
            storageKey={STORAGE_KEYS.SIDEBAR_TAGS_COLLAPSED}
          >
            {tree.map(renderItem)}
          </SidebarSection>
        </div>
      )}

      {pendingDelete && (
        <DeleteTagDialog
          tagId={pendingDelete.item.id}
          path={pendingDelete.item.path}
          open
          onOpenChange={(open) => !open && setPendingDelete(undefined)}
          onDeleted={() => {
            followFilter(pendingDelete.item.path);
            setPendingDelete(undefined);
          }}
          onCloseAutoFocus={(event) =>
            handleDeleteCloseAutoFocus(event, pendingDelete)
          }
        />
      )}
    </>
  );
}
