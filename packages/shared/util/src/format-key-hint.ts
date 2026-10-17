export function formatKeyHint(prefix: string, suffix: string | null): string {
  return `${prefix}…${suffix ?? ''}`;
}
