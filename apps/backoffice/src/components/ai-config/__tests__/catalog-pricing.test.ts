import { describe, expect, it } from 'vitest';

import type { AiConfigEntry, CatalogModel } from '@knowtis/data-access-admin';
import { FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

import { freeTierCeilingFrom, isByokOnly } from '../catalog-pricing';

const DEFAULT_CEILING = FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN;
const TIGHTENED_CEILING = 0.0000025;

function model(outputCostPerToken: number): CatalogModel {
  return {
    id: 'openrouter:vendor/one',
    label: 'One',
    description: '',
    status: 'candidate',
    tier: 'open',
    inputCostPerToken: 0.0000002,
    outputCostPerToken,
    maxInputTokens: 100000,
    maxOutputTokens: 8192,
    intelligenceIndex: null,
    upstreamCreatedAt: null,
    upstreamExpirationDate: null,
    lastSeenAt: new Date('2026-08-10T00:00:00.000Z'),
    promotedAt: null,
  } as unknown as CatalogModel;
}

function ceilingEntry(value: string): AiConfigEntry {
  return {
    key: 'ai_free_tier_ceiling',
    value,
    kind: 'money',
    source: 'custom',
    storedValue: null,
    description: null,
    updatedAt: null,
  } as unknown as AiConfigEntry;
}

describe('isByokOnly', () => {
  it('admits a model priced at the ceiling', () => {
    expect(isByokOnly(model(DEFAULT_CEILING), DEFAULT_CEILING)).toBe(false);
  });

  it('excludes a model priced above the ceiling', () => {
    expect(isByokOnly(model(DEFAULT_CEILING * 1.1), DEFAULT_CEILING)).toBe(
      true
    );
  });

  // The badge is the admin's only warning about who can run a model. Reading a
  // ceiling the operator no longer uses makes it claim the free tier absorbs
  // models the server already gates.
  it('follows a tightened ceiling instead of the shipped default', () => {
    const midPriced = model(0.0000035);

    expect(isByokOnly(midPriced, DEFAULT_CEILING)).toBe(false);
    expect(isByokOnly(midPriced, TIGHTENED_CEILING)).toBe(true);
  });

  it('excludes a negatively priced model, which is a broken row', () => {
    expect(isByokOnly(model(-1), DEFAULT_CEILING)).toBe(true);
  });
});

describe('freeTierCeilingFrom', () => {
  it('reads the operator ceiling as a per-token rate', () => {
    expect(freeTierCeilingFrom([ceilingEntry('2.50')])).toBe(0.0000025);
  });

  it('falls back to the code default when the API serves no ceiling', () => {
    expect(freeTierCeilingFrom([])).toBe(DEFAULT_CEILING);
    expect(freeTierCeilingFrom(undefined)).toBe(DEFAULT_CEILING);
  });

  it('falls back to the code default when the value is not a number', () => {
    expect(freeTierCeilingFrom([ceilingEntry('none')])).toBe(DEFAULT_CEILING);
    expect(freeTierCeilingFrom([ceilingEntry('-1')])).toBe(DEFAULT_CEILING);
  });
});
