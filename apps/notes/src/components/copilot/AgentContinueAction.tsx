import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CornerDownRight } from 'lucide-react';

import { Button } from '@knowtis/design-system';

interface AgentContinueActionProps {
  /** The answer stopped at a checkpoint, so it is labelled partial. */
  partial: boolean;
  onContinue: () => void;
}

export function AgentContinueAction({
  partial,
  onContinue,
}: AgentContinueActionProps) {
  const { t } = useTranslation('notes');
  const partialId = useId();
  const [requested, setRequested] = useState(false);

  const request = () => {
    if (requested) {
      return;
    }
    setRequested(true);
    onContinue();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {partial && (
        <span
          id={partialId}
          className="text-xs font-medium text-muted-foreground"
        >
          {t('ai.copilot.continue.partial')}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={requested}
        onClick={request}
        {...(partial ? { 'aria-describedby': partialId } : {})}
      >
        <CornerDownRight aria-hidden="true" className="h-3.5 w-3.5" />
        {t('ai.copilot.continue.action')}
      </Button>
    </div>
  );
}
