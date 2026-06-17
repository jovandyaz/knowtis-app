import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  buildReconcilePrompt,
  MemoryOpSchema,
  partitionOps,
} from './memory-reconcile';

describe('MemoryOpSchema (OpenAI strict structured outputs)', () => {
  it('marks every operation property as required so strict mode accepts the schema', () => {
    const json = z.toJSONSchema(MemoryOpSchema) as { required?: string[] };
    expect(json.required ?? []).toEqual(
      expect.arrayContaining(['op', 'id', 'content'])
    );
  });
});

describe('partitionOps', () => {
  const existing = ['a', 'b'];

  it('keeps valid ADD/UPDATE/DELETE and drops NOOP', () => {
    const { adds, updates, deletes } = partitionOps(
      [
        { op: 'ADD', id: null, content: 'new fact' },
        { op: 'UPDATE', id: 'a', content: 'fixed' },
        { op: 'DELETE', id: 'b', content: null },
        { op: 'NOOP', id: null, content: null },
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
        { op: 'DELETE', id: 'zzz', content: null },
        { op: 'ADD', id: null, content: '  ' },
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
        { op: 'DELETE', id: 'a', content: null },
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
