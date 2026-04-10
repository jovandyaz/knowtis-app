/**
 * Picks only the properties from `source` whose values are not `undefined`.
 * Useful for building partial update objects from optional inputs.
 */
export function pickDefined<T extends object>(
  source: T,
  keys: readonly (keyof T)[]
): Partial<Pick<T, (typeof keys)[number]>> {
  const result: Partial<T> = {};

  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result;
}
