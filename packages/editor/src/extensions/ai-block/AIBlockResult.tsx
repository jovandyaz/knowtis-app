import { useTranslation } from 'react-i18next';

import { Check, RotateCcw, X } from 'lucide-react';
import { Streamdown } from 'streamdown';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

interface AIBlockResultProps {
  content: string;
  onInsert: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

export function AIBlockResult({
  content,
  onInsert,
  onRetry,
  onDiscard,
}: AIBlockResultProps) {
  const { t } = useTranslation('notes');

  return (
    <div>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onInsert}>
            <Check className="mr-1 h-3 w-3" />
            {t('ai.aiBlock.insert')}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onRetry}>
                <RotateCcw className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('ai.aiBlock.retry')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onDiscard}>
                <X className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('ai.aiBlock.discard')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="px-4 pb-4">
        <Streamdown mode="static">{content}</Streamdown>
      </div>
    </div>
  );
}
