import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/stores/agent.store';
import { ChevronDown, History, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  useConversations,
  useRenameConversation,
} from '@knowtis/data-access-agent';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@knowtis/design-system';
import { formatRelativeTime } from '@knowtis/shared-util';

import { conversationErrorKey } from './conversation-error';
import {
  ConversationRenameInput,
  type RenameExit,
} from './ConversationRenameInput';
import { DeleteConversationDialog } from './DeleteConversationDialog';

const CONVERSATION_SWITCHER_LIMIT = 25;
const MENU_COLLISION_PADDING_PX = 8;
const SUBTITLE_SEPARATOR = ' · ';

interface DeleteTarget {
  id: string;
  title: string;
}

export function ConversationSwitcher() {
  const { t, i18n } = useTranslation('notes');
  const conversationId = useAgentStore((s) => s.conversationId);
  const conversationTitle = useAgentStore((s) => s.conversationTitle);
  const openConversation = useAgentStore((s) => s.openConversation);
  const setConversationTitle = useAgentStore((s) => s.setConversationTitle);
  const { data, isError } = useConversations(CONVERSATION_SWITCHER_LIMIT);
  const rename = useRenameConversation({
    onSuccess: (_data, renamed) => {
      if (useAgentStore.getState().conversationId === renamed.id) {
        setConversationTitle(renamed.title);
      }
    },
    onError: (error) => {
      toast.error(t(conversationErrorKey(error)));
    },
  });
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Closing the menu hands focus back to its trigger, which would pull it out
  // of the rename field that has just taken it.
  const renameTakesFocus = useRef(false);

  const untitled = t('ai.copilot.history.untitled');
  const titleOf = (title: string | null) => (title ? title : untitled);
  const activeTitle =
    conversationTitle ??
    data?.items.find((conversation) => conversation.id === conversationId)
      ?.title;
  const triggerLabel = activeTitle
    ? activeTitle
    : conversationId
      ? untitled
      : t('ai.copilot.history.recent');

  const select = async (id: string) => {
    const outcome = await openConversation(id, 'switcher');
    if (outcome === 'gone') {
      toast.info(t('ai.copilot.history.gone'));
    }
  };

  const endRename = (exit: RenameExit) => {
    renameTakesFocus.current = false;
    flushSync(() => setRenaming(false));
    if (exit === 'keyboard') {
      triggerRef.current?.focus();
    }
  };

  const saveTitle = (title: string) => {
    const id = conversationId;
    endRename('keyboard');
    if (!id || title === activeTitle) {
      return;
    }
    rename.mutate({ id, title });
  };

  if (renaming && conversationId) {
    return (
      <ConversationRenameInput
        title={activeTitle ?? ''}
        onSubmit={saveTitle}
        onCancel={endRename}
      />
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 min-w-0 max-w-full justify-start gap-1.5 px-2 font-medium"
          >
            <History
              className="h-4 w-4 shrink-0 opacity-70"
              aria-hidden="true"
            />
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 opacity-60"
              aria-hidden="true"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          collisionPadding={MENU_COLLISION_PADDING_PX}
          className="w-72 max-w-[calc(100vw-2rem)] max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto"
          onCloseAutoFocus={(event) => {
            if (renameTakesFocus.current) {
              renameTakesFocus.current = false;
              event.preventDefault();
            }
          }}
        >
          {conversationId && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  renameTakesFocus.current = true;
                  setRenaming(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                {t('ai.copilot.history.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-(--destructive) focus:bg-(--destructive)/10 focus:text-(--destructive)"
                onSelect={() =>
                  setDeleteTarget({ id: conversationId, title: triggerLabel })
                }
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('ai.copilot.history.delete')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-xs uppercase tracking-wide">
            {t('ai.copilot.history.recent')}
          </DropdownMenuLabel>
          {isError && !data && (
            <DropdownMenuItem disabled>
              {t('ai.copilot.history.listFailed')}
            </DropdownMenuItem>
          )}
          {data && data.items.length === 0 && (
            <DropdownMenuItem disabled>
              {t('ai.copilot.history.empty')}
            </DropdownMenuItem>
          )}
          {data && data.items.length > 0 && (
            <DropdownMenuRadioGroup
              value={conversationId ?? ''}
              onValueChange={(id) => void select(id)}
            >
              {data.items.map((conversation) => {
                const title = titleOf(conversation.title);
                return (
                  <DropdownMenuRadioItem
                    key={conversation.id}
                    value={conversation.id}
                    textValue={title}
                    aria-label={t('ai.copilot.history.openLabel', { title })}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate">{title}</span>
                      <span className="flex min-w-0 text-xs text-(--muted-foreground)">
                        {conversation.noteTitle && (
                          <>
                            <span className="truncate">
                              {conversation.noteTitle}
                            </span>
                            <span className="shrink-0 whitespace-pre">
                              {SUBTITLE_SEPARATOR}
                            </span>
                          </>
                        )}
                        <span className="shrink-0">
                          {formatRelativeTime(
                            new Date(conversation.updatedAt),
                            i18n.language
                          )}
                        </span>
                      </span>
                    </span>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {deleteTarget && (
        <DeleteConversationDialog
          conversationId={deleteTarget.id}
          title={deleteTarget.title}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
            }
          }}
          onCloseAutoFocus={(event) => {
            // The dialog's opener was a menu item that closed with its menu, so
            // Radix has nothing to restore focus to.
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
