import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '../utils';

export interface RecordingTimerProps {
  elapsed: number;
  maxDuration: number;
  isRecording: boolean;
  className?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function RecordingTimer({
  elapsed,
  maxDuration,
  isRecording,
  className,
}: RecordingTimerProps) {
  const percentage = Math.min((elapsed / maxDuration) * 100, 100);
  const remaining = maxDuration - elapsed;
  const isNearLimit = remaining <= 30;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-center gap-2">
        {isRecording && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            'font-mono text-lg tabular-nums tracking-wider',
            isNearLimit ? 'text-red-500' : 'text-(--foreground)'
          )}
        >
          {formatTime(elapsed)}
        </span>
        <span className="text-(--muted-foreground) font-mono text-sm tabular-nums">
          / {formatTime(maxDuration)}
        </span>
      </div>

      <ProgressPrimitive.Root
        value={percentage}
        max={100}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-(--muted)"
        getValueLabel={(value) =>
          `${Math.round(value)}% of recording time used`
        }
      >
        <ProgressPrimitive.Indicator
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            isNearLimit ? 'bg-red-500' : 'bg-(--primary)'
          )}
          style={{ width: `${percentage}%` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}

RecordingTimer.displayName = 'RecordingTimer';
