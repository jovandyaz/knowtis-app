import { describe, expect, it } from 'vitest';

import { buildReconcilePrompt, partitionOps } from './memory-reconcile';

describe('partitionOps', () => {
  const existing = ['a', 'b'];

  it('keeps valid ADD/UPDATE/DELETE and drops NOOP', () => {
    const { adds, updates, deletes } = partitionOps(
      [
        { op: 'ADD', content: 'new fact' },
        { op: 'UPDATE', id: 'a', content: 'fixed' },
        { op: 'DELETE', id: 'b' },
        { op: 'NOOP' },
      ],
      existing
    );
    expect(adds).toEqual(['new fact']);
    expect(updates).toEqual([{ id: 'a', content: 'fixed' }]);
    expect(deletes).toEqual(['b']);
  });

  it('drops UPDATE/DELETE whose id is not in existing, and empty-content ops', () => {
    const { adds, updates, deletes } = partitionOps(
      [
        { op: 'UPDATE', id: 'zzz', content: 'x' },
        { op: 'DELETE', id: 'zzz' },
        { op: 'ADD', content: '  ' },
        { op: 'UPDATE', id: 'a', content: '' },
      ],
      existing
    );
    expect(adds).toEqual([]);
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it('drops an UPDATE when the same id is also deleted', () => {
    const { updates, deletes } = partitionOps(
      [
        { op: 'UPDATE', id: 'a', content: 'changed' },
        { op: 'DELETE', id: 'a' },
      ],
      existing
    );
    expect(deletes).toEqual(['a']);
    expect(updates).toEqual([]);
  });
});

describe('buildReconcilePrompt', () => {
  it('numbers existing memories by id and includes the transcript as DATA', () => {
    const prompt = buildReconcilePrompt(
      'user: I switched from React to Vue\nassistant: Noted.',
      [{ id: 'm1', content: 'Uses React' }]
    );
    expect(prompt).toContain('m1');
    expect(prompt).toContain('Uses React');
    expect(prompt).toContain('switched from React to Vue');
    expect(prompt.toLowerCase()).toContain('data');
  });

  it('falls back to a (none yet) marker when there are no existing memories', () => {
    const prompt = buildReconcilePrompt('user: I am vegan', []);
    expect(prompt).toContain('(none yet)');
  });
});
