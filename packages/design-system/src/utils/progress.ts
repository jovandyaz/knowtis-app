export const PROGRESS_MAX_FLOOR = 1;

export interface ClampedProgress {
  safeMax: number;
  clamped: number;
  ratio: number;
}

export function clampProgress(value: number, max: number): ClampedProgress {
  const safeMax = Number.isFinite(max)
    ? Math.max(max, PROGRESS_MAX_FLOOR)
    : PROGRESS_MAX_FLOOR;
  const safeValue = Number.isFinite(value) ? value : 0;
  const clamped = Math.min(Math.max(safeValue, 0), safeMax);
  const ratio = clamped / safeMax;
  return { safeMax, clamped, ratio };
}
