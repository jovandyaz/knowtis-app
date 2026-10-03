import { useTranslation } from 'react-i18next';

import { useAvailableModels } from '@/hooks/useAvailableModels';
import type { ReplyModelFallback } from '@/stores/agent.store';
import { useAuthUser } from '@jovandyaz/auth-react';

const UNKNOWN_REASON = 'other';

export function AgentModelFallbackNotice({
  fallback,
}: {
  fallback: ReplyModelFallback;
}) {
  const { t } = useTranslation('notes');
  const user = useAuthUser();
  const { data: catalog } = useAvailableModels(
    user != null && user.isAnonymous !== true
  );
  const model =
    catalog?.models.find((m) => m.id === fallback.to)?.label ?? fallback.to;

  return (
    <p className="text-xs text-muted-foreground">
      {t(`ai.copilot.modelFallback.${fallback.reason ?? UNKNOWN_REASON}`, {
        model,
      })}
    </p>
  );
}
