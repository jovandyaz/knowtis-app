import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import type { UpdateProposal } from '@/stores/agent.store';
import { ArrowDown, ArrowLeft, ArrowUp, PencilLine } from 'lucide-react';

import { Button, cn, DocumentSkeleton, Switch } from '@knowtis/design-system';
import {
  diffNoteHtml,
  DiffPreview,
  ReadOnlyEditor,
  type DocDiff,
} from '@knowtis/editor';
import { logger } from '@knowtis/shared-util';

import { sanitizeAiHtml } from '../../lib/sanitize-ai-html';
import { ConfirmationFooter } from '../ai-elements/confirmation';
import { REVIEW_EXTENSIONS } from './proposal-review-extensions';
import { ProposalActions } from './ProposalActions';
import { useProposalBefore } from './useProposalBefore';
import { useProposalDecision } from './useProposalDecision';

interface UpdatePayloadView {
  readonly title?: string;
  readonly contentHtml?: string;
}

interface ProposalReviewProps {
  proposal: UpdateProposal;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onBack: () => void;
}

type ReviewItem = { kind: 'title' } | { kind: 'change'; index: number };

const PROSE_CLASSES = 'prose prose-sm dark:prose-invert max-w-none';

function computeDiff(beforeHtml: string, afterHtml: string): DocDiff | null {
  try {
    return diffNoteHtml(beforeHtml, afterHtml, REVIEW_EXTENSIONS);
  } catch (error) {
    logger.error('ProposalReview: diff failed', { error });
    return null;
  }
}

function summaryKey(payload: UpdatePayloadView) {
  if (payload.title !== undefined && payload.contentHtml !== undefined) {
    return 'ai.copilot.review.summary.titleAndContent' as const;
  }
  return payload.contentHtml !== undefined
    ? ('ai.copilot.review.summary.contentOnly' as const)
    : ('ai.copilot.review.summary.titleOnly' as const);
}

export function ProposalReview({
  proposal,
  onApprove,
  onReject,
  onBack,
}: ProposalReviewProps) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const payload = proposal.payload as UpdatePayloadView;
  const before = useProposalBefore(proposal.id, proposal.targetNoteId);
  const decision = useProposalDecision(onApprove, onReject);
  const [showDeleted, setShowDeleted] = useState(false);
  const [current, setCurrent] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [trackedProposalId, setTrackedProposalId] = useState(proposal.id);
  if (proposal.id !== trackedProposalId) {
    setTrackedProposalId(proposal.id);
    setCurrent(0);
    setShowDeleted(false);
  }

  const afterHtml = useMemo(
    () => sanitizeAiHtml(payload.contentHtml ?? ''),
    [payload.contentHtml]
  );
  const beforeHtml = before.status === 'ready' ? before.contentHtml : null;
  const hasContentChange = payload.contentHtml !== undefined;
  const diff = useMemo(
    () =>
      beforeHtml === null
        ? null
        : computeDiff(beforeHtml, hasContentChange ? afterHtml : beforeHtml),
    [beforeHtml, afterHtml, hasContentChange]
  );

  const titleChanged =
    payload.title !== undefined &&
    before.status === 'ready' &&
    payload.title !== before.title;

  const items = useMemo<ReviewItem[]>(
    () => [
      ...(titleChanged ? [{ kind: 'title' } as const] : []),
      ...(diff?.changes.map(
        (_, index) => ({ kind: 'change', index }) as const
      ) ?? []),
    ],
    [titleChanged, diff]
  );
  const total = items.length;
  const currentItem = items[current] ?? null;
  const currentChangeIndex =
    currentItem?.kind === 'change' ? currentItem.index : null;

  useEffect(() => {
    if (!currentItem) {
      return;
    }
    const selector =
      currentItem.kind === 'title'
        ? '[data-testid="review-title"]'
        : `[data-change="${currentItem.index}"]`;
    const target = bodyRef.current?.querySelector<HTMLElement>(selector);
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    target?.scrollIntoView({
      block: 'center',
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [currentItem]);

  const step = (delta: number) =>
    setCurrent((c) => (total === 0 ? 0 : (c + delta + total) % total));

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.altKey &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp')
    ) {
      event.preventDefault();
      step(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    decision.onKeyDown(event);
  };

  const labels = useMemo(
    () => ({
      deletedBlocks: (count: number) =>
        t('ai.copilot.review.deletedBlocks', { count }),
      deletedInline: t('ai.copilot.review.deletedInline'),
    }),
    [t]
  );

  const showFallback =
    before.status === 'error' || (before.status === 'ready' && diff === null);

  return (
    // Keyboard shortcuts (approve/reject/navigate) are scoped to this panel, not to one control.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label={t('ai.copilot.review.title')}
      onKeyDown={onKeyDown}
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex items-start gap-2 border-b border-border px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          aria-label={t('ai.copilot.review.back')}
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <PencilLine className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t('ai.copilot.review.title')}
          </p>
          {before.status === 'ready' && (
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{before.title}</span>
              {!before.isLive && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto shrink-0 p-0 text-xs"
                  onClick={() =>
                    navigate({
                      to: ROUTES.NOTE,
                      params: { noteId: proposal.targetNoteId },
                    })
                  }
                >
                  {t('ai.copilot.review.openNote')}
                </Button>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t(summaryKey(payload))}
            {diff
              ? ` · ${t('ai.copilot.review.changes', { count: total })}`
              : ''}
          </p>
        </div>
      </header>

      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span aria-live="polite" className="mr-1">
          {total > 0
            ? t('ai.copilot.review.changeOf', { current: current + 1, total })
            : t('ai.copilot.review.changes', { count: 0 })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          aria-label={t('ai.copilot.review.prev')}
          disabled={total < 2}
          onClick={() => step(-1)}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          aria-label={t('ai.copilot.review.next')}
          disabled={total < 2}
          onClick={() => step(1)}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <label className="ml-auto flex items-center gap-2">
          <span>{t('ai.copilot.review.showDeleted')}</span>
          <Switch
            size="sm"
            checked={showDeleted}
            onCheckedChange={setShowDeleted}
          />
        </label>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {titleChanged && (
          <div
            data-testid="review-title"
            className={cn(
              'mb-3 rounded-md border border-border/70 px-3 py-2',
              currentItem?.kind === 'title' && 'ring-2 ring-primary/40'
            )}
          >
            <p className="text-[11px] text-muted-foreground">
              {t('ai.copilot.review.titleLabel')}
            </p>
            {showDeleted && before.status === 'ready' && (
              <p className="text-sm text-destructive line-through">
                {before.title}
              </p>
            )}
            <p className="text-sm font-semibold">
              <span className="diff-ins">{payload.title}</span>
            </p>
          </div>
        )}

        {before.status === 'loading' && (
          <DocumentSkeleton label={t('editor.loadingNote')} />
        )}

        {before.status === 'ready' &&
          diff &&
          diff.count === 0 &&
          !titleChanged && (
            <p className="mb-3 text-xs text-muted-foreground">
              {t('ai.copilot.review.noChanges')}
            </p>
          )}

        {showFallback && (
          <>
            <p role="status" className="mb-3 text-xs text-muted-foreground">
              {t('ai.copilot.review.beforeUnavailable')}
            </p>
            <div className={PROSE_CLASSES}>
              <ReadOnlyEditor content={afterHtml} />
            </div>
          </>
        )}

        {diff && (
          <DiffPreview
            diff={diff}
            extensions={REVIEW_EXTENSIONS}
            showDeleted={showDeleted}
            currentIndex={currentChangeIndex}
            labels={labels}
            className={PROSE_CLASSES}
          />
        )}
      </div>

      <ConfirmationFooter>
        <ProposalActions
          decision={decision}
          approveLabel={t('ai.copilot.proposal.approveUpdate')}
          disabled={before.status === 'loading'}
        />
      </ConfirmationFooter>
    </div>
  );
}
