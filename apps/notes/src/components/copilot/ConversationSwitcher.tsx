import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/stores/agent.store';
import { ChevronDown, History } from 'lucide-react';
import { toast } from 'sonner';

import { useConversations } from '@knowtis/data-access-agent';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@knowtis/design-system';
import { formatRelativeTime } from '@knowtis/shared-util';

export const CONVERSATION_SWITCHER_LIMIT = 25;
const SUBTITLE_SEPARATOR = ' · ';

export function ConversationSwitcher() {
  const { t, i18n } = useTranslation('notes');
  const conversationId = useAgentStore((s) => s.conversationId);
  const conversationTitle = useAgentStore((s) => s.conversationTitle);
  const openConversation = useAgentStore((s) => s.openConversation);
  const { data } = useConversations(CONVERSATION_SWITCHER_LIMIT);

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 min-w-0 max-w-full justify-start gap-1.5 px-2 font-medium"
        >
          <History className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 opacity-60"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        className="w-72 max-w-[calc(100vw-2rem)] max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto"
      >
        <DropdownMenuLabel className="text-xs uppercase tracking-wide">
          {t('ai.copilot.history.recent')}
        </DropdownMenuLabel>
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
  );
}
