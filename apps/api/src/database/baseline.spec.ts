import { describe, expect, it } from 'vitest';

import { planBaseline } from './baseline';

const migrations = [
  { hash: 'h0', folderMillis: 100 },
  { hash: 'h1', folderMillis: 200 },
  { hash: 'h2', folderMillis: 300 },
];

describe('planBaseline', () => {
  it('records every migration when nothing is tracked and no cutoff is given', () => {
    const rows = planBaseline(migrations, new Set());
    expect(rows).toEqual([
      { hash: 'h0', createdAt: 100 },
      { hash: 'h1', createdAt: 200 },
      { hash: 'h2', createdAt: 300 },
    ]);
  });

  it('skips migrations already recorded (idempotent by created_at)', () => {
    const rows = planBaseline(migrations, new Set([100, 200]));
    expect(rows).toEqual([{ hash: 'h2', createdAt: 300 }]);
  });

  it('records only migrations up to the cutoff so later ones stay pending', () => {
    const rows = planBaseline(migrations, new Set(), 200);
    expect(rows).toEqual([
      { hash: 'h0', createdAt: 100 },
      { hash: 'h1', createdAt: 200 },
    ]);
  });

  it('returns nothing when everything up to the cutoff is already recorded', () => {
    const rows = planBaseline(migrations, new Set([100, 200]), 200);
    expect(rows).toEqual([]);
  });
});
