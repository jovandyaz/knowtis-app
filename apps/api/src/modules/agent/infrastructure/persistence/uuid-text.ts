/** Matches a uuid written as text. A stored id that is not a uuid names no note, and casting one in SQL would fail the whole query. */
export const UUID_TEXT_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const UUID_TEXT = new RegExp(UUID_TEXT_PATTERN);

export function isUuidText(value: string): boolean {
  return UUID_TEXT.test(value);
}
