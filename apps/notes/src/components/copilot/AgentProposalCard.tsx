import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { PendingProposal } from '@/stores/agent.store';
import DOMPurify from 'dompurify';
import {
  ArrowUp,
  FilePlus2,
  PencilLine,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Badge, Button, cn, Textarea } from '@knowtis/design-system';

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationFooter,
} from '../ai-elements/confirmation';

interface ProposalPayloadView {
  readonly title?: string;
  readonly contentHtml?: string;
  readonly targetEmail?: string;
  readonly permission?: 'viewer' | 'editor';
}

const KIND_META = {
  create: {
    icon: FilePlus2,
    titleKey: 'ai.copilot.proposal.createTitle' as const,
    approveKey: 'ai.copilot.proposal.approveCreate' as const,
  },
  update: {
    icon: PencilLine,
    titleKey: 'ai.copilot.proposal.updateTitle' as const,
    approveKey: 'ai.copilot.proposal.approveUpdate' as const,
  },
  share: {
    icon: UserPlus,
    titleKey: 'ai.copilot.proposal.shareTitle' as const,
    approveKey: 'ai.copilot.proposal.approveShare' as const,
  },
} satisfies Record<
  PendingProposal['kind'],
  { icon: LucideIcon; titleKey: string; approveKey: string }
>;

interface AgentProposalCardProps {
  proposal: PendingProposal;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}

export function AgentProposalCard({
  proposal,
  onApprove,
  onReject,
}: AgentProposalCardProps) {
  const { t } = useTranslation('notes');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [expanded, setExpanded] = useState(false);

  const meta = KIND_META[proposal.kind];
  const Icon = meta.icon;
  const payload = proposal.payload as ProposalPayloadView;

  const approve = () => onApprove();
  const confirmReject = () => onReject(reason.trim() || undefined);
  const cancelReject = () => {
    setRejecting(false);
    setReason('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (rejecting) {
        confirmReject();
      } else {
        approve();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (rejecting) {
        cancelReject();
      } else {
        onReject();
      }
    }
  };

  return (
    <Confirmation
      role="group"
      aria-label={t(meta.titleKey)}
      onKeyDown={onKeyDown}
    >
      <div className="flex max-h-[min(60vh,28rem)] flex-col">
        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          <div className="flex items-start gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {t(meta.titleKey)}
              </p>
              <p className="text-xs text-muted-foreground">{proposal.summary}</p>
            </div>
          </div>

          {proposal.kind === 'share' ? (
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs">
              <span className="truncate text-foreground">
                {payload.targetEmail}
              </span>
              <Badge variant="secondary" className="ml-auto shrink-0 capitalize">
                {payload.permission === 'editor'
                  ? t('ai.copilot.proposal.editor')
                  : t('ai.copilot.proposal.viewer')}
              </Badge>
            </div>
          ) : (
            proposal.previewHtml && (
              <div className="flex flex-col gap-1">
                <div
                  id="proposal-preview"
                  data-testid="proposal-preview"
                  className={cn(
                    'overflow-y-auto rounded-md border border-border/70 bg-muted/20 px-3 py-2 transition-[max-height] duration-200 motion-reduce:transition-none',
                    expanded ? 'max-h-[min(40vh,20rem)]' : 'max-h-40'
                  )}
                >
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-xs [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                    // previewHtml is LLM-generated; re-sanitize client-side as defense-in-depth.
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(proposal.previewHtml),
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 self-start px-1.5 text-xs text-muted-foreground"
                  aria-expanded={expanded}
                  aria-controls="proposal-preview"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded
                    ? t('ai.copilot.proposal.showLess')
                    : t('ai.copilot.proposal.showMore')}
                </Button>
              </div>
            )
          )}
        </div>

        <ConfirmationFooter>
          <AnimatePresence mode="wait" initial={false}>
            {rejecting ? (
              <motion.div
                key="reason"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="flex w-full flex-col gap-2 overflow-hidden"
              >
                <Textarea
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('ai.copilot.proposal.reasonPlaceholder')}
                  aria-label={t('ai.copilot.proposal.reasonPlaceholder')}
                  rows={2}
                  className="min-h-14 resize-none text-xs"
                />
                <ConfirmationActions>
                  <ConfirmationAction variant="ghost" onClick={cancelReject}>
                    {t('ai.copilot.proposal.rejectCancel')}
                  </ConfirmationAction>
                  <ConfirmationAction variant="secondary" onClick={confirmReject}>
                    {t('ai.copilot.proposal.rejectConfirm')}
                    <ArrowUp className="ml-1 size-3.5" />
                  </ConfirmationAction>
                </ConfirmationActions>
              </motion.div>
            ) : (
              <ConfirmationActions key="actions" className="w-full">
                <ConfirmationAction
                  variant="ghost"
                  onClick={() => setRejecting(true)}
                >
                  {t('ai.copilot.proposal.reject')}
                </ConfirmationAction>
                <ConfirmationAction className="min-w-20" onClick={approve}>
                  {t(meta.approveKey)}
                </ConfirmationAction>
              </ConfirmationActions>
            )}
          </AnimatePresence>
        </ConfirmationFooter>
      </div>
    </Confirmation>
  );
}
