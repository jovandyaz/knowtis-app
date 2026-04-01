import { useTranslation } from 'react-i18next';

import { RotateCcw, Settings2 } from 'lucide-react';
import { motion } from 'motion/react';

import {
  Button,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

interface FlashcardHeaderProps {
  current: number;
  total: number;
  reviewedCount: number;
  isAdvancedMode: boolean;
  onToggleAdvanced: () => void;
  onRestart: () => void;
}

const RING_SIZE = 40;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function FlashcardHeader({
  current,
  total,
  reviewedCount,
  isAdvancedMode,
  onToggleAdvanced,
  onRestart,
}: FlashcardHeaderProps) {
  const { t } = useTranslation('notes');
  const progress = total > 0 ? reviewedCount / total : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        {/* Progress ring */}
        <div
          className="relative"
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="-rotate-90"
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={RING_STROKE}
              className="text-muted/30"
            />
            <motion.circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              className="text-primary"
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-foreground">
            {reviewedCount}
          </span>
        </div>

        <span className="text-sm text-muted-foreground">
          {t('ai.artifacts.flashcards.cardOf', {
            current: current + 1,
            total,
          })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <Switch
                checked={isAdvancedMode}
                onCheckedChange={onToggleAdvanced}
                size="sm"
                aria-label={t('ai.artifacts.flashcards.advancedMode')}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {t('ai.artifacts.flashcards.advancedMode')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRestart}
              className="h-8 w-8"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t('ai.artifacts.flashcards.restart')}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
