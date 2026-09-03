import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useVerifyEmailGate } from '@/hooks/useVerifyEmailGate';
import { useAgentStore } from '@/stores/agent.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';

import { AGENT_EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import {
  aiErrorMessageKey,
  GENERIC_AI_ERROR_KEY,
} from '../editor/ai/ai-error-messages';
import { AgentComposer } from './AgentComposer';
import { AgentEmptyState } from './AgentEmptyState';
import { AgentMessageList } from './AgentMessageList';
import { AgentProposalCard } from './AgentProposalCard';
import { CopilotModelPicker } from './CopilotModelPicker';
import { RetryBanner } from './RetryBanner';

export function AgentCopilotPanel() {
  const { t } = useTranslation('notes');
  const messages = useAgentStore((s) => s.messages);
  const status = useAgentStore((s) => s.status);
  const error = useAgentStore((s) => s.error);
  const answeredError = useAgentStore((s) => s.answeredError);
  const markErrorAnswered = useAgentStore((s) => s.markErrorAnswered);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const cancel = useAgentStore((s) => s.cancel);
  const retryLast = useAgentStore((s) => s.retryLast);
  const thinkingText = useAgentStore((s) => s.thinkingText);
  const pendingProposal = useAgentStore((s) => s.pendingProposal);
  const approveProposal = useAgentStore((s) => s.approveProposal);
  const rejectProposal = useAgentStore((s) => s.rejectProposal);
  const activeNoteId = useArtifactSidebarStore((s) => s.activeNoteId);
  const { canVerify, prompt: promptVerification } = useVerifyEmailGate();

  const send = (text: string) => {
    sendMessage(text, activeNoteId ?? undefined);
  };

  const isVerificationGate = error?.code === AGENT_EMAIL_NOT_VERIFIED_CODE;
  // Naming verification to a visitor with no address is advice they cannot take.
  const errorMessageKey =
    isVerificationGate && !canVerify
      ? GENERIC_AI_ERROR_KEY
      : aiErrorMessageKey(error?.code ?? '');

  // Retrying a share the account is not allowed to make would only fail again,
  // so the one useful answer to this code is the verification dialog itself.
  // The store outlives this panel, and so must the record of having offered.
  useEffect(() => {
    if (!error || !isVerificationGate || answeredError === error) {
      return;
    }
    markErrorAnswered();
    promptVerification();
  }, [
    error,
    isVerificationGate,
    answeredError,
    markErrorAnswered,
    promptVerification,
  ]);

  return (
    <div className="flex h-full flex-col min-h-0">
      {messages.length === 0 ? (
        <div className="flex-1 min-h-0">
          <AgentEmptyState onSelectSuggestion={send} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <AgentMessageList
            messages={messages}
            status={status}
            thinkingDetail={thinkingText}
          />
        </div>
      )}

      {status === 'error' && (
        <RetryBanner message={t(errorMessageKey)} onRetry={retryLast} />
      )}
      {status === 'timeout' && (
        <RetryBanner message={t('ai.errors.timeout')} onRetry={retryLast} />
      )}

      {pendingProposal && (
        <div className="px-3 pb-2">
          <AgentProposalCard
            proposal={pendingProposal}
            onApprove={approveProposal}
            onReject={rejectProposal}
          />
        </div>
      )}

      <AgentComposer
        onSend={send}
        onStop={cancel}
        status={status}
        modelPicker={<CopilotModelPicker />}
      />
    </div>
  );
}
