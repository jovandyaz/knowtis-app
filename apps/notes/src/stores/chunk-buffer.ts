export interface ChunkBufferOptions {
  flushMs: number;
  onFlush: (text: string) => void;
  inactivityMs?: number;
  onInactivity?: () => void;
}

export interface ChunkBuffer {
  push: (text: string) => void;
  flush: () => void;
  discard: () => void;
  armInactivityTimer: () => void;
  clearInactivityTimer: () => void;
}

/**
 * Batches streamed text chunks so consumers update state at most every
 * `flushMs` and, when `inactivityMs` is set, fires `onInactivity` (after
 * flushing) once no chunk arrives within that window. Timers live in this
 * closure — not in store state — so per-chunk arm/clear never re-renders
 * subscribers.
 */
export function createChunkBuffer({
  flushMs,
  inactivityMs,
  onFlush,
  onInactivity,
}: ChunkBufferOptions): ChunkBuffer {
  let buffer = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flush = () => {
    clearFlushTimer();
    if (buffer) {
      const buffered = buffer;
      buffer = '';
      onFlush(buffered);
    }
  };

  const clearInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  };

  // Re-armed per chunk so long generations aren't cut off mid-stream.
  const armInactivityTimer = () => {
    clearInactivityTimer();
    if (inactivityMs === undefined || !onInactivity) {
      return;
    }
    inactivityTimer = setTimeout(() => {
      inactivityTimer = null;
      flush();
      onInactivity();
    }, inactivityMs);
  };

  return {
    push: (text) => {
      armInactivityTimer();
      buffer += text;
      if (!flushTimer) {
        flushTimer = setTimeout(flush, flushMs);
      }
    },
    flush,
    discard: () => {
      clearFlushTimer();
      buffer = '';
    },
    armInactivityTimer,
    clearInactivityTimer,
  };
}
