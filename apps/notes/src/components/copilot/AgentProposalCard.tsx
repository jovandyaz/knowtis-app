import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { PendingProposal } from '@/stores/agent.store';
import { FilePlus2, PencilLine, UserPlus, type LucideIcon } from 'lucide-react';

import { Badge, Button, cn } from '@knowtis/design-system';
import { ReadOnlyEditor } from '@knowtis/editor';

import { sanitizeProposalHtml } from '../../lib/sanitize-ai-html';
import { Confirmation, ConfirmationFooter } from '../ai-elements/confirmation';
import { readProposalPayload } from './proposal-payload';
import { ProposalActions } from './ProposalActions';
import { useProposalDecision } from './useProposalDecision';

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
  const decision = useProposalDecision(onApprove, onReject);
  const [expanded, setExpanded] = useState(false);

  const meta = KIND_META[proposal.kind];
  const Icon = meta.icon;
  const payload = readProposalPayload(proposal.payload);
  const previewHtml =
    proposal.kind !== 'share' && payload.contentHtml
      ? sanitizeProposalHtml(payload.contentHtml)
      : null;

  return (
    <Confirmation
      role="group"
      aria-label={t(meta.titleKey)}
      onKeyDown={decision.onKeyDown}
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
              {payload.title && (
                <p className="truncate text-xs text-muted-foreground">
                  {payload.title}
                </p>
              )}
            </div>
          </div>

          {proposal.kind === 'share' ? (
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs">
              <span className="truncate text-foreground">
                {payload.targetEmail}
              </span>
              <Badge
                variant="secondary"
                className="ml-auto shrink-0 capitalize"
              >
                {payload.permission === 'editor'
                  ? t('ai.copilot.proposal.editor')
                  : t('ai.copilot.proposal.viewer')}
              </Badge>
            </div>
          ) : (
            previewHtml && (
              <div className="flex flex-col gap-1">
                <div
                  id="proposal-preview"
                  data-testid="proposal-preview"
                  className={cn(
                    'prose prose-sm dark:prose-invert max-w-none overflow-y-auto rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs transition-[max-height] duration-200 motion-reduce:transition-none',
                    expanded ? 'max-h-[min(40vh,20rem)]' : 'max-h-40'
                  )}
                >
                  <ReadOnlyEditor content={previewHtml} />
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
          <ProposalActions
            decision={decision}
            approveLabel={t(meta.approveKey)}
          />
        </ConfirmationFooter>
      </div>
    </Confirmation>
  );
}
