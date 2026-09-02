import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAISettings, useAvailableModels } from '@/hooks';
import { useVerifyEmailGate } from '@/hooks/useVerifyEmailGate';
import { useAgentStore } from '@/stores/agent.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { useAuthUser } from '@jovandyaz/auth-react';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import {
  AGENT_EMAIL_NOT_VERIFIED_CODE,
  FEATURE_FLAG_KEYS,
} from '@knowtis/shared-types';

import {
  aiErrorMessageKey,
  GENERIC_AI_ERROR_KEY,
} from '../editor/ai/ai-error-messages';
import { AgentComposer } from './AgentComposer';
import { AgentEmptyState } from './AgentEmptyState';
import { AgentMessageList } from './AgentMessageList';
import { AgentProposalCard } from './AgentProposalCard';
import { CopilotModelPicker } from './CopilotModelPicker';
import { resolveSelectedModel } from './intent-picker-options';
import { RetryBanner } from './RetryBanner';
import { ThinkPill } from './ThinkPill';

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

  const user = useAuthUser();
  const isAnonymous = user?.isAnonymous === true;
  const canUseByok =
    useFeatureFlag(FEATURE_FLAG_KEYS.AGENT_BYOK) && !isAnonymous;
  const { data: models } = useAvailableModels(user != null);
  const { data: prefs } = useAISettings(user != null);
  const resolvedModel = resolveSelectedModel(models, prefs);
  // Holding a key is not enough: the server only bills the turn to the user
  // when the key covers the resolved model's provider, so a mismatched key
  // must not swap the pill for the effort ladder.
  const hasByok = canUseByok && resolvedModel?.billedToUser === true;
  // Free registered users get the pill; BYOK effort lives in the model menu,
  // so the two controls are mutually exclusive by audience.
  const pillHidden =
    user == null ||
    isAnonymous ||
    hasByok ||
    (resolvedModel?.reasoning?.levels.length ?? 0) === 0;

  const [thinkActive, setThinkActive] = useState(false);

  // 'high' is a fixed sentinel: the server clamps a free turn to the model's
  // real boost level, so the pill never has to know per-model budgets.
  const send = (text: string) => {
    const boost = !pillHidden && thinkActive;
    sendMessage(
      text,
      activeNoteId ?? undefined,
      boost ? { effort: 'high' } : undefined
    );
    setThinkActive(false);
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
        modelPicker={
          <>
            <CopilotModelPicker />
            <ThinkPill
              active={thinkActive}
              onToggle={() => setThinkActive((v) => !v)}
              hidden={pillHidden}
            />
          </>
        }
      />
    </div>
  );
}
