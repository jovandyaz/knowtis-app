import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAISettings, useUpdateAISettings } from '@/hooks/useAISettings';
import { useAgentStore } from '@/stores/agent.store';
import { useAIStore } from '@/stores/ai.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { Brain, Pause } from 'lucide-react';
import { toast } from 'sonner';

import { useMemories } from '@knowtis/data-access-agent';
import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  Switch,
} from '@knowtis/design-system';
import {
  MEMORY_ENABLED_BY_DEFAULT,
  type UserMemoryItem,
} from '@knowtis/shared-types';

import { SectionHeader } from '../SectionHeader';
import {
  ForgetMemoriesDialog,
  type ForgetMemoriesTarget,
} from './ForgetMemoriesDialog';
import { MemoryRow } from './MemoryRow';

const SKELETON_ROWS = 3;

function MemoryListSkeleton() {
  const { t } = useTranslation('common');
  return (
    <div role="status" className="rounded-lg border border-(--border)">
      <span className="sr-only">{t('memory.loading')}</span>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div
          key={row}
          aria-hidden="true"
          className="space-y-2 border-b border-(--border) px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function MemorySection() {
  const { t } = useTranslation('common');
  const { t: tNotes } = useTranslation('notes');
  const {
    data: prefs,
    isError: prefsFailed,
    refetch: refetchPrefs,
  } = useAISettings();
  const { mutate: updatePrefs } = useUpdateAISettings();
  const memories = useMemories();
  const user = useAuthUser();
  const aiEnabled = useAIStore((s) => s.aiEnabled);
  const closeSettings = useSettingsStore((s) => s.close);
  const openDock = useRightDockStore((s) => s.open);
  const [forgetTarget, setForgetTarget] = useState<ForgetMemoriesTarget | null>(
    null
  );
  const listTitleRef = useRef<HTMLHeadingElement>(null);
  const switchId = useId();
  const labelId = useId();
  const hintId = useId();
  const listTitleId = useId();
  const memoryEnabled = prefs?.memoryEnabled ?? MEMORY_ENABLED_BY_DEFAULT;
  const saved = memories.data ?? [];

  const toggleMemory = (enabled: boolean) => {
    updatePrefs({ memoryEnabled: enabled });
  };

  const openSource = async (conversationId: string) => {
    closeSettings();
    openDock('composer');
    const agent = useAgentStore.getState();
    if (user) {
      agent.bindUser({ id: user.id, isAnonymous: user.isAnonymous === true });
    }
    if ((await agent.openConversation(conversationId, 'memory')) === 'gone') {
      toast.info(tNotes('ai.copilot.history.gone'));
    }
  };

  const forgetOne = (memory: UserMemoryItem) =>
    setForgetTarget({ memoryId: memory.id });

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <SectionHeader
          title={t('settings.sections.memory')}
          description={t('settings.descriptions.memory')}
        />
        <div className="flex items-center gap-4 rounded-lg border border-(--border) p-4">
          <label
            htmlFor={switchId}
            className="min-w-0 flex-1 cursor-pointer space-y-1"
          >
            <span id={labelId} className="block text-sm text-(--foreground)">
              {t('memory.toggleLabel')}
            </span>
            <span
              id={hintId}
              className="block text-xs text-(--muted-foreground)"
            >
              {t('memory.toggleHint')}
            </span>
          </label>
          <Switch
            id={switchId}
            checked={memoryEnabled}
            disabled={!prefs}
            onCheckedChange={toggleMemory}
            aria-labelledby={labelId}
            aria-describedby={hintId}
          />
        </div>
        {prefsFailed && !prefs ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="alert" className="text-xs text-(--destructive)">
              {t('errors.errorLoadingData')}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refetchPrefs()}
            >
              {t('buttons.tryAgain')}
            </Button>
          </div>
        ) : null}
        <div role="status">
          {prefs?.memoryEnabled === false ? (
            <p className="flex gap-3 rounded-lg bg-(--muted) p-4 text-sm text-(--muted-foreground)">
              <Pause className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('memory.paused')}</span>
            </p>
          ) : null}
        </div>
      </div>

      <section aria-labelledby={listTitleId} className="space-y-3">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <h4
            ref={listTitleRef}
            id={listTitleId}
            tabIndex={-1}
            className="rounded-sm text-sm font-semibold text-(--foreground) outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
          >
            {t('memory.listTitle')}
            {saved.length > 0 ? (
              <>
                {' '}
                <span className="font-normal tabular-nums text-(--muted-foreground)">
                  {saved.length}
                </span>
              </>
            ) : null}
          </h4>
          {saved.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setForgetTarget({ count: saved.length })}
              className="border-(--destructive)/40 text-(--destructive) hover:bg-(--destructive)/10 hover:text-(--destructive)"
            >
              {t('memory.forgetAll')}
            </Button>
          ) : null}
        </div>

        {memories.isPending ? (
          <MemoryListSkeleton />
        ) : memories.isError && !memories.data ? (
          <ErrorState
            title={t('memory.errorTitle')}
            message={t('memory.errorDescription')}
            retryLabel={t('buttons.tryAgain')}
            onRetry={() => void memories.refetch()}
            fullHeight={false}
          />
        ) : saved.length === 0 ? (
          <EmptyState
            icon={<Brain className="h-8 w-8 text-(--muted-foreground)" />}
            title={t('memory.emptyTitle')}
            description={t('memory.emptyDescription')}
            fullHeight={false}
          />
        ) : (
          <ul
            aria-labelledby={listTitleId}
            className="divide-y divide-(--border) rounded-lg border border-(--border)"
          >
            {saved.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                onForget={forgetOne}
                onOpenSource={aiEnabled ? openSource : null}
              />
            ))}
          </ul>
        )}

        <p className="text-xs text-(--muted-foreground)">
          {t('memory.footnote')}
        </p>
      </section>

      {forgetTarget ? (
        <ForgetMemoriesDialog
          target={forgetTarget}
          onClose={() => setForgetTarget(null)}
          returnFocusRef={listTitleRef}
        />
      ) : null}
    </div>
  );
}
