import { useTranslation } from 'react-i18next';

import { AGENT_STOP_REASON, type AgentStopReason } from '@knowtis/shared-types';

interface AgentStopNoticeProps {
  reason?: AgentStopReason | undefined;
  interrupted?: boolean | undefined;
}

export function AgentStopNotice({ reason, interrupted }: AgentStopNoticeProps) {
  const { t } = useTranslation('notes');

  let notice: string | null = null;
  if (interrupted) {
    notice = t('ai.copilot.interrupted');
  } else if (reason && reason !== AGENT_STOP_REASON.COMPLETED) {
    notice = t(`ai.copilot.stopReason.${reason}`);
  }
  if (notice === null) {
    return null;
  }

  return (
    <p role="status" className="text-xs text-muted-foreground">
      {notice}
    </p>
  );
}
