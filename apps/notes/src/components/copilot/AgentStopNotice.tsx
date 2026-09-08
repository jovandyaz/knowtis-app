import { useTranslation } from 'react-i18next';

import { AGENT_STOP_REASON, type AgentStopReason } from '@knowtis/shared-types';

export function AgentStopNotice({ reason }: { reason?: AgentStopReason }) {
  const { t } = useTranslation('notes');

  if (!reason || reason === AGENT_STOP_REASON.COMPLETED) {
    return null;
  }

  return (
    <p role="status" className="text-xs text-muted-foreground">
      {t(`ai.copilot.stopReason.${reason}`)}
    </p>
  );
}
