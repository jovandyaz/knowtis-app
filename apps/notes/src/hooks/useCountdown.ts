import { useCallback, useEffect, useState } from 'react';

const MS_PER_SECOND = 1000;

export interface Countdown {
  secondsLeft: number;
  /** Restarts at `durationMs`, or at the wait the caller names instead. */
  restart: (durationMs?: number) => void;
}

export interface CountdownOptions {
  /** False where no cooldown is running yet, so the first send is one click away. */
  startHeld?: boolean;
}

/**
 * Counts down to a deadline, so a throttled or backgrounded tab resumes with
 * the real time left instead of the number of ticks it managed to run.
 * `secondsLeft` reaches 0 exactly once the duration has elapsed.
 */
export function useCountdown(
  durationMs: number,
  { startHeld = true }: CountdownOptions = {}
): Countdown {
  const initialMs = startHeld ? durationMs : 0;
  const [deadline, setDeadline] = useState(() => Date.now() + initialMs);
  const [remainingMs, setRemainingMs] = useState(initialMs);

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs(left);
      if (left === 0) {
        clearInterval(intervalId);
      }
    };

    const intervalId = setInterval(tick, MS_PER_SECOND);
    tick();

    return () => clearInterval(intervalId);
  }, [deadline]);

  const restart = useCallback(
    (overrideMs?: number) => {
      const nextMs = overrideMs ?? durationMs;
      setDeadline(Date.now() + nextMs);
      setRemainingMs(nextMs);
    },
    [durationMs]
  );

  return { secondsLeft: Math.ceil(remainingMs / MS_PER_SECOND), restart };
}
