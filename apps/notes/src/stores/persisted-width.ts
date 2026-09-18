export interface PersistedWidthBounds {
  min: number;
  max: number;
  fallback: number;
}

export function readPersistedWidth(
  value: unknown,
  bounds: PersistedWidthBounds
): number {
  const isUsable =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= bounds.min &&
    value <= bounds.max;

  return isUsable ? value : bounds.fallback;
}

/** Clamps a direct width write into range; returns undefined for a non-finite value so callers can leave the current width untouched. */
export function clampWidth(
  value: number,
  bounds: Pick<PersistedWidthBounds, 'min' | 'max'>
): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(Math.max(value, bounds.min), bounds.max);
}
