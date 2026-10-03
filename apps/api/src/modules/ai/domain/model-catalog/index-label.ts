const LATEST_NAME_SUFFIX = ' (latest)';

/** An index row's upstream name as a picker shows it: a trailing ` (latest)` is dropped, since the row already is the resolved model. */
export function toPickerLabel(name: string): string {
  return name.endsWith(LATEST_NAME_SUFFIX)
    ? name.slice(0, -LATEST_NAME_SUFFIX.length)
    : name;
}
