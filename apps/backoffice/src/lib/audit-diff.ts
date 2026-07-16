import type { AuditEntry } from '@knowtis/data-access-admin';

export interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}

export function computeFieldChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): FieldChange[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys]
    .filter(
      (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])
    )
    .map((key) => ({ key, before: before?.[key], after: after?.[key] }));
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function formatTarget(entry: AuditEntry): string {
  return entry.targetId
    ? `${entry.targetType}: ${entry.targetId}`
    : entry.targetType;
}

export function formatChangeSummary(entry: AuditEntry): string {
  const changes = computeFieldChanges(entry.before, entry.after);
  if (changes.length === 0) {
    return '—';
  }
  const parts = changes
    .slice(0, 2)
    .map(
      (change) =>
        `${change.key}: ${formatValue(change.before)} → ${formatValue(change.after)}`
    );
  const extra = changes.length - 2;
  return extra > 0 ? `${parts.join(', ')} +${extra} more` : parts.join(', ');
}
