import { cn } from '../utils/cn';
import { Progress } from './Progress';

const SECONDS_PER_MINUTE = 60;
const NEAR_LIMIT_SECONDS = 30;

export interface RecordingTimerProps {
  elapsed: number;
  maxDuration: number;
  isRecording: boolean;
  className?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / SECONDS_PER_MINUTE);
  const secs = seconds % SECONDS_PER_MINUTE;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function RecordingTimer({
  elapsed,
  maxDuration,
  isRecording,
  className,
}: RecordingTimerProps) {
  const isNearLimit = maxDuration - elapsed <= NEAR_LIMIT_SECONDS;
  const elapsedLabel = formatTime(elapsed);
  const totalLabel = formatTime(maxDuration);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-center gap-2">
        {isRecording && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full bg-(--destructive) motion-safe:animate-pulse"
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            'font-mono text-lg tabular-nums tracking-wider',
            isNearLimit ? 'text-(--destructive)' : 'text-(--foreground)'
          )}
        >
          {elapsedLabel}
        </span>
        <span className="text-(--muted-foreground) font-mono text-sm tabular-nums">
          / {totalLabel}
        </span>
      </div>

      <Progress
        value={elapsed}
        max={maxDuration}
        label={`${elapsedLabel} / ${totalLabel}`}
        tone={isNearLimit ? 'danger' : 'primary'}
      />
    </div>
  );
}

RecordingTimer.displayName = 'RecordingTimer';
