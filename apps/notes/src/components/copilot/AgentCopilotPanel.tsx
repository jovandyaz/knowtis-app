import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useParams } from '@tanstack/react-router';

import { useVerifyEmailGate } from '@/hooks/useVerifyEmailGate';
import { isUpdateProposal, useAgentStore } from '@/stores/agent.store';
import { useRightDockStore } from '@/stores/right-dock.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { toast } from 'sonner';

import {
  AGENT_CONVERSATION_NOT_FOUND_CODE,
  AGENT_EMAIL_NOT_VERIFIED_CODE,
} from '@knowtis/shared-types';

import {
  aiErrorMessageKey,
  GENERIC_AI_ERROR_KEY,
} from '../editor/ai/ai-error-messages';
import { AgentComposer } from './AgentComposer';
import { AgentEmptyState } from './AgentEmptyState';
import { AgentMessageList } from './AgentMessageList';
import { AgentProposalCard } from './AgentProposalCard';
import { AgentStatusIndicator } from './AgentStatusIndicator';
import { CopilotModelPicker } from './CopilotModelPicker';
import { ProposalPendingRow } from './ProposalPendingRow';
import { ProposalReview } from './ProposalReview';
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
  const queueLength = useAgentStore((s) => s.queue.length);
  const draft = useAgentStore((s) => s.draft);
  const setDraft = useAgentStore((s) => s.setDraft);
  const takeBackQueued = useAgentStore((s) => s.takeBackQueued);
  const conversationId = useAgentStore((s) => s.conversationId);
  const hydration = useAgentStore((s) => s.hydration);
  const hasEarlier = useAgentStore((s) => s.hasEarlier);
  const openConversation = useAgentStore((s) => s.openConversation);
  const userId = useAuthUser()?.id ?? null;
  // Not the editor's activeNoteId: that stays null until the lazy editor chunk
  // mounts, and a message sent in that window would lose its note.
  const { noteId } = useParams({ strict: false }) as { noteId?: string };
  const { canVerify, prompt: promptVerification } = useVerifyEmailGate();
  const reviewOpen = useRightDockStore((s) => s.reviewOpen);
  const openReview = useRightDockStore((s) => s.openReview);
  const closeReview = useRightDockStore((s) => s.closeReview);
  const updateProposal =
    pendingProposal && isUpdateProposal(pendingProposal)
      ? pendingProposal
      : null;
  const updateProposalId = updateProposal?.id ?? null;

  useEffect(() => {
    if (updateProposalId) {
      openReview();
    } else {
      closeReview();
    }
    return closeReview;
  }, [updateProposalId, openReview, closeReview]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const store = useAgentStore.getState();
    store.bindUser(userId);
    const { conversationId: remembered, messages: shown } =
      useAgentStore.getState();
    if (remembered && shown.length === 0) {
      void store.openConversation(remembered, 'reload');
    }
  }, [userId]);

  const send = (text: string) => {
    sendMessage(text, noteId);
  };
  const sendNow = (text: string) => {
    sendMessage(text, noteId, { interrupt: true });
  };
  const retryHydration = () => {
    if (conversationId) {
      void openConversation(conversationId, 'reload');
    }
  };

  const isVerificationGate = error?.code === AGENT_EMAIL_NOT_VERIFIED_CODE;
  const conversationWasGone = error?.code === AGENT_CONVERSATION_NOT_FOUND_CODE;
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

  useEffect(() => {
    if (!error || !conversationWasGone || answeredError === error) {
      return;
    }
    markErrorAnswered();
    toast.info(t('ai.copilot.history.gone'));
  }, [error, conversationWasGone, answeredError, markErrorAnswered, t]);

  if (updateProposal && reviewOpen) {
    return (
      <ProposalReview
        proposal={updateProposal}
        onApprove={approveProposal}
        onReject={rejectProposal}
        onBack={closeReview}
      />
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      {hydration === 'loading' ? (
        <div className="flex-1 min-h-0 px-4 py-3">
          <AgentStatusIndicator label={t('ai.copilot.history.loading')} />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 min-h-0">
          <AgentEmptyState onSelectSuggestion={send} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <AgentMessageList
            messages={messages}
            status={status}
            thinkingDetail={thinkingText}
            hasEarlier={hasEarlier}
          />
        </div>
      )}

      {hydration === 'failed' && (
        <RetryBanner
          message={t('ai.copilot.history.loadFailed')}
          onRetry={retryHydration}
        />
      )}
      {status === 'error' && (
        <RetryBanner message={t(errorMessageKey)} onRetry={retryLast} />
      )}
      {status === 'timeout' && (
        <RetryBanner message={t('ai.errors.timeout')} onRetry={retryLast} />
      )}

      {updateProposal && <ProposalPendingRow onOpen={openReview} />}

      {pendingProposal && !updateProposal && (
        <div className="px-3 pb-2">
          <AgentProposalCard
            proposal={pendingProposal}
            onApprove={approveProposal}
            onReject={rejectProposal}
          />
        </div>
      )}

      <AgentComposer
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        onSendNow={sendNow}
        onStop={cancel}
        onTakeBack={takeBackQueued}
        queueLength={queueLength}
        status={status}
        modelPicker={<CopilotModelPicker />}
      />
    </div>
  );
}
