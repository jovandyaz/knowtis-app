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

import {
  Button,
  cn,
  DocumentSkeleton,
  Switch,
  useMotionPreset,
} from '@knowtis/design-system';
import {
  CHANGE_ATTR,
  createBaseExtensions,
  DIFF_DEL_CLASS,
  DIFF_INS_CLASS,
  diffNoteHtml,
  DiffPreview,
  ReadOnlyEditor,
  type DocDiff,
} from '@knowtis/editor';
import { logger } from '@knowtis/shared-util';

import { sanitizeProposalHtml } from '../../lib/sanitize-ai-html';
import { ConfirmationFooter } from '../ai-elements/confirmation';
import {
  readProposalPayload,
  type ProposalPayloadView,
} from './proposal-payload';
import { ProposalActions } from './ProposalActions';
import { useProposalBefore } from './useProposalBefore';
import { useProposalDecision } from './useProposalDecision';

interface ProposalReviewProps {
  proposal: UpdateProposal;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onBack: () => void;
}

type ReviewItem = { kind: 'title' } | { kind: 'change'; index: number };

const PROSE_CLASSES = 'prose prose-sm dark:prose-invert max-w-none';

const REVIEW_EXTENSIONS = createBaseExtensions({ openLinksOnClick: true });

const ROOT_CLASSES =
  'flex h-full min-h-0 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

export const DIFF_MAX_HTML_CHARS = 200_000;

function isEditingLiveNote(root: HTMLElement | null): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    active.closest('[contenteditable="true"], input, textarea') !== null &&
    !root?.contains(active)
  );
}

function computeDiff(beforeHtml: string, afterHtml: string): DocDiff | null {
  try {
    return diffNoteHtml(beforeHtml, afterHtml, REVIEW_EXTENSIONS);
  } catch (error) {
    logger.error('ProposalReview: diff failed', { error });
    return null;
  }
}

function summaryKey(payload: ProposalPayloadView) {
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
  const payload = readProposalPayload(proposal.payload);
  const before = useProposalBefore(proposal.id, proposal.targetNoteId);
  const { reduced } = useMotionPreset();
  const decision = useProposalDecision(onApprove, onReject);
  const [showDeleted, setShowDeleted] = useState(false);
  const [current, setCurrent] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The shortcuts live on this container and the chat subtree it replaces is gone,
  // so without taking focus once on mount they would never receive a key event.
  useEffect(() => {
    if (isEditingLiveNote(rootRef.current)) {
      return;
    }
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const [trackedProposalId, setTrackedProposalId] = useState(proposal.id);
  if (proposal.id !== trackedProposalId) {
    setTrackedProposalId(proposal.id);
    setCurrent(0);
    setShowDeleted(false);
  }

  const afterHtml = useMemo(
    () => sanitizeProposalHtml(payload.contentHtml ?? ''),
    [payload.contentHtml]
  );
  const beforeHtml = before.status === 'ready' ? before.contentHtml : null;
  const hasContentChange = payload.contentHtml !== undefined;
  const tooLargeForDiff =
    beforeHtml !== null &&
    beforeHtml.length + afterHtml.length > DIFF_MAX_HTML_CHARS;
  const diff = useMemo(
    () =>
      beforeHtml === null || tooLargeForDiff
        ? null
        : computeDiff(beforeHtml, hasContentChange ? afterHtml : beforeHtml),
    [beforeHtml, afterHtml, hasContentChange, tooLargeForDiff]
  );

  const titleChanged =
    payload.title !== undefined &&
    before.status === 'ready' &&
    payload.title !== before.title;
  const showProposedTitle =
    before.status === 'error' && payload.title !== undefined;

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
        : `[${CHANGE_ATTR}="${currentItem.index}"]`;
    const target = bodyRef.current?.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({
      block: 'center',
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [currentItem, reduced]);

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
      ref={rootRef}
      role="group"
      tabIndex={-1}
      aria-label={t('ai.copilot.review.title')}
      onKeyDown={onKeyDown}
      className={ROOT_CLASSES}
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

      {!tooLargeForDiff && (
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span aria-live="polite" className="mr-1">
            {total > 0
              ? t('ai.copilot.review.changeOf', {
                  current: current + 1,
                  total,
                })
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
      )}

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {(titleChanged || showProposedTitle) && (
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
              <p className="text-sm text-destructive">
                <del className={DIFF_DEL_CLASS}>{before.title}</del>
              </p>
            )}
            <p className="text-sm font-semibold">
              <ins className={DIFF_INS_CLASS}>{payload.title}</ins>
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
              {t(
                tooLargeForDiff
                  ? 'ai.copilot.review.tooLargeForDiff'
                  : 'ai.copilot.review.beforeUnavailable'
              )}
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
