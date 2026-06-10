import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/stores/agent.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { RotateCcw } from 'lucide-react';

import { Button } from '@knowtis/design-system';

import { aiErrorMessageKey } from '../editor/ai/ai-error-messages';
import { AgentComposer } from './AgentComposer';
import { AgentEmptyState } from './AgentEmptyState';
import { AgentMessageList } from './AgentMessageList';
import { AgentProposalCard } from './AgentProposalCard';
import { RetryBanner } from './RetryBanner';

export function AgentCopilotPanel() {
  const { t } = useTranslation('notes');
  const messages = useAgentStore((s) => s.messages);
  const status = useAgentStore((s) => s.status);
  const error = useAgentStore((s) => s.error);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const newConversation = useAgentStore((s) => s.newConversation);
  const retryLast = useAgentStore((s) => s.retryLast);
  const pendingProposal = useAgentStore((s) => s.pendingProposal);
  const approveProposal = useAgentStore((s) => s.approveProposal);
  const rejectProposal = useAgentStore((s) => s.rejectProposal);
  const activeNoteId = useArtifactSidebarStore((s) => s.activeNoteId);

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex items-center justify-end border-b border-border px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={newConversation}
          disabled={messages.length === 0}
          aria-label={t('ai.copilot.newConversation')}
          className="h-7 w-7 p-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {messages.length === 0 ? (
        <div className="flex-1 min-h-0">
          <AgentEmptyState />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <AgentMessageList messages={messages} status={status} />
        </div>
      )}

      {status === 'error' && (
        <RetryBanner
          message={t(aiErrorMessageKey(error?.code ?? ''))}
          onRetry={retryLast}
        />
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
        onSend={(text) => sendMessage(text, activeNoteId ?? undefined)}
        disabled={status === 'streaming' || status === 'pendingProposal'}
      />
    </div>
  );
}
