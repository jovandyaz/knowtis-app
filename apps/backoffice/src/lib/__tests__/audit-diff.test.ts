import { describe, expect, it } from 'vitest';

import type { AuditEntry } from '@knowtis/data-access-admin';

import { computeFieldChanges, formatChangeSummary } from '../audit-diff';

function entry(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): AuditEntry {
  return {
    id: '3b241101-e2bb-4255-8caf-4136c566a962',
    actorId: '5b241101-e2bb-4255-8caf-4136c566a963',
    actorEmail: 'ada@knowtis.app',
    action: 'user.role_changed',
    targetType: 'user',
    targetId: 'u1',
    before,
    after,
    createdAt: new Date('2026-07-15T10:00:00Z'),
  };
}

describe('computeFieldChanges', () => {
  it('returns only the fields that changed', () => {
    const changes = computeFieldChanges(
      { role: 'user', name: 'Ada' },
      { role: 'admin', name: 'Ada' }
    );
    expect(changes).toEqual([{ key: 'role', before: 'user', after: 'admin' }]);
  });

  it('includes added and removed fields', () => {
    const changes = computeFieldChanges(
      { enabled: true },
      { description: 'x' }
    );
    expect(changes).toContainEqual({
      key: 'enabled',
      before: true,
      after: undefined,
    });
    expect(changes).toContainEqual({
      key: 'description',
      before: undefined,
      after: 'x',
    });
  });

  it('compares nested values structurally', () => {
    expect(
      computeFieldChanges({ nested: { a: 1 } }, { nested: { a: 1 } })
    ).toEqual([]);
    expect(
      computeFieldChanges({ nested: { a: 1 } }, { nested: { a: 2 } })
    ).toHaveLength(1);
  });

  it('handles null payloads', () => {
    expect(computeFieldChanges(null, null)).toEqual([]);
    expect(computeFieldChanges(null, { role: 'admin' })).toEqual([
      { key: 'role', before: undefined, after: 'admin' },
    ]);
  });
});

describe('formatChangeSummary', () => {
  it('formats a single change inline', () => {
    expect(
      formatChangeSummary(entry({ role: 'user' }, { role: 'admin' }))
    ).toBe('role: user → admin');
  });

  it('caps at two changes and counts the rest', () => {
    const result = formatChangeSummary(
      entry({ a: 1, b: 2, c: 3 }, { a: 9, b: 8, c: 7 })
    );
    expect(result).toBe('a: 1 → 9, b: 2 → 8 +1 more');
  });

  it('returns a dash when nothing changed', () => {
    expect(formatChangeSummary(entry(null, null))).toBe('—');
  });
});
