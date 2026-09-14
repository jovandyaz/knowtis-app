import { useTranslation } from 'react-i18next';

import { ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Textarea, useMotionPreset } from '@knowtis/design-system';

import {
  ConfirmationAction,
  ConfirmationActions,
} from '../ai-elements/confirmation';
import type { ProposalDecision } from './useProposalDecision';

interface ProposalActionsProps {
  decision: ProposalDecision;
  approveLabel: string;
  disabled?: boolean;
}

export function ProposalActions({
  decision,
  approveLabel,
  disabled = false,
}: ProposalActionsProps) {
  const { t } = useTranslation('notes');
  const { fade } = useMotionPreset();

  return (
    <AnimatePresence mode="wait" initial={false}>
      {decision.rejecting ? (
        <motion.div
          key="reason"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={fade}
          className="flex w-full flex-col gap-2 overflow-hidden"
        >
          <Textarea
            autoFocus
            value={decision.reason}
            onChange={(e) => decision.setReason(e.target.value)}
            placeholder={t('ai.copilot.proposal.reasonPlaceholder')}
            aria-label={t('ai.copilot.proposal.reasonPlaceholder')}
            rows={2}
            className="min-h-14 resize-none text-xs"
          />
          <ConfirmationActions>
            <ConfirmationAction variant="ghost" onClick={decision.cancelReject}>
              {t('ai.copilot.proposal.rejectCancel')}
            </ConfirmationAction>
            <ConfirmationAction
              variant="secondary"
              onClick={decision.confirmReject}
            >
              {t('ai.copilot.proposal.rejectConfirm')}
              <ArrowUp className="ml-1 size-3.5" />
            </ConfirmationAction>
          </ConfirmationActions>
        </motion.div>
      ) : (
        <ConfirmationActions key="actions" className="w-full">
          <ConfirmationAction
            variant="ghost"
            disabled={disabled}
            onClick={decision.startReject}
          >
            {t('ai.copilot.proposal.reject')}
          </ConfirmationAction>
          <ConfirmationAction
            className="min-w-20"
            disabled={disabled}
            onClick={decision.approve}
          >
            {approveLabel}
          </ConfirmationAction>
        </ConfirmationActions>
      )}
    </AnimatePresence>
  );
}
