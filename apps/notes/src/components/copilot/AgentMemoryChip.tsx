import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import type { UsedMemory } from '@/stores/agent.store';
import {
  useSettingsStore,
  type SettingsSection,
} from '@/stores/settings.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { Brain } from 'lucide-react';

import { memoriesQueryKeys } from '@knowtis/data-access-agent';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@knowtis/design-system';

import { UsedMemoryList } from './UsedMemoryList';

const MEMORY_SECTION = 'memory' satisfies SettingsSection;
const VIEWPORT_GUTTER_PX = 16;
const POPOVER_MAX_HEIGHT = 'min(calc(var(--spacing) * 88), 40dvh)';
const POPOVER_SIZE = {
  maxWidth: `calc(100vw - ${VIEWPORT_GUTTER_PX * 2}px)`,
  maxHeight: POPOVER_MAX_HEIGHT,
} as const;

export function AgentMemoryChip({
  memories,
}: {
  memories: readonly UsedMemory[];
}) {
  const { t } = useTranslation('notes');
  const queryClient = useQueryClient();
  const user = useAuthUser();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const managing = useRef(false);
  const titleId = useId();

  if (memories.length === 0) {
    return null;
  }

  const settingsAvailable = user?.isAnonymous !== true;

  const changeOpen = (next: boolean) => {
    if (next) {
      void queryClient.invalidateQueries({
        queryKey: memoriesQueryKeys.list(),
      });
    }
    setOpen(next);
  };

  const manage = () => {
    managing.current = true;
    setOpen(false);
  };

  const openSettingsOnceClosed = (event: Event) => {
    if (!managing.current) {
      return;
    }
    managing.current = false;
    event.preventDefault();
    triggerRef.current?.focus();
    useSettingsStore.getState().open(MEMORY_SECTION);
  };

  return (
    <div className="mt-2">
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-full border border-border/60 px-2.5 text-xs font-normal text-muted-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
          >
            <Brain aria-hidden="true" className="size-3.5" />
            {t('ai.copilot.memoriesUsed', { count: memories.length })}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={contentRef}
          side="top"
          align="start"
          collisionPadding={VIEWPORT_GUTTER_PX}
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
          onCloseAutoFocus={openSettingsOnceClosed}
          style={POPOVER_SIZE}
          className="flex w-80 flex-col overflow-y-auto overscroll-contain p-0"
        >
          <PopoverTitle id={titleId} className="px-4 pt-3 pb-1 text-sm">
            {t('ai.copilot.memoriesTitle')}
          </PopoverTitle>
          <UsedMemoryList memories={memories} />
          {settingsAvailable && (
            <div className="sticky bottom-0 border-t border-border/60 bg-(--popover) p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={manage}
                className="w-full justify-start px-3 font-normal"
              >
                {t('ai.copilot.memoriesManage')}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
