import { INDEX_PROVIDERS } from '@jovandyaz/llm-router';
import { describe, expect, it } from 'vitest';

import { BYOK_PROVIDERS, MODEL_INTENTS } from '@knowtis/shared-types';

import {
  resolveByokIntent,
  resolvePlatformIntent,
  RETIREMENT_WINDOW_DAYS,
} from '../domain/model-catalog/model-selectors';
import { plainRouteCanonical } from '../domain/model-catalog/plain-route';
import { MS_PER_DAY } from '../domain/value-objects/utc-day';
import { FIXTURE_DATE, FIXTURE_INDEX, fixtureRow } from './fixture-index';

const HARD_CODED_RETIREMENT = '2026-10-20T00:00:00Z';

describe('fixture index', () => {
  it('lists a row for every index provider, so no spec serves a snapshot floor row', () => {
    expect(new Set(FIXTURE_INDEX.map((row) => row.provider))).toEqual(
      new Set(INDEX_PROVIDERS)
    );
  });

  it('resolves every intent on every BYOK provider and the platform at FIXTURE_DATE', () => {
    for (const intent of MODEL_INTENTS) {
      expect(
        resolvePlatformIntent(intent, FIXTURE_INDEX, FIXTURE_DATE),
        `platform ${intent}`
      ).not.toBeNull();
      for (const provider of BYOK_PROVIDERS) {
        expect(
          resolveByokIntent(intent, provider, FIXTURE_INDEX, FIXTURE_DATE),
          `${intent} on ${provider}`
        ).not.toBeNull();
      }
    }
  });

  it('keeps the hard-coded 2026-10-20 retirement inside the eligibility window', () => {
    const daysAhead =
      (Date.parse(HARD_CODED_RETIREMENT) - FIXTURE_DATE.getTime()) / MS_PER_DAY;

    expect(fixtureRow('openrouter:google/gemini-2.5-pro').retiresAt).toBe(
      '2026-10-20'
    );
    expect(daysAhead).toBeGreaterThan(0);
    expect(daysAhead).toBeLessThanOrEqual(RETIREMENT_WINDOW_DAYS);
  });

  it('files a pro SKU under its base model, as the index does, so it is no plain route of it', () => {
    const sku = fixtureRow('openrouter:openai/gpt-5.6-terra-pro');

    expect(sku.canonical).toBe('openai/gpt-5-6-terra');
    expect(plainRouteCanonical(sku.id, sku.canonical)).toBeUndefined();
  });

  it.each([
    [
      'a pro SKU',
      'openai:gpt-5.6-sol',
      'openrouter:openai/gpt-5.6-sol-pro',
      'openai/gpt-5-6-sol',
    ],
    [
      'a batch variant',
      'google:gemini-3.5-flash',
      'openrouter:google/gemini-3.5-flash:batch',
      'google/gemini-3-5-flash',
    ],
  ])(
    'files %s under its base model, so only the base is a plain route of it',
    (_, base, variant, canonical) => {
      expect(fixtureRow(base).canonical).toBe(canonical);
      expect(fixtureRow(variant).canonical).toBe(canonical);
      expect(plainRouteCanonical(base, canonical)).toBe(canonical);
      expect(plainRouteCanonical(variant, canonical)).toBeUndefined();
    }
  );

  it.each([
    ['openrouter:z-ai/glm-5.3', 'zhipuai/glm-5-3'],
    ['openrouter:z-ai/glm-5.2', 'zhipuai/glm-5-2'],
  ])(
    'files %s under the zhipuai canonical upstream gives it, so it is no plain route of it',
    (id, canonical) => {
      expect(fixtureRow(id).canonical).toBe(canonical);
      expect(plainRouteCanonical(id, canonical)).toBeUndefined();
    }
  );

  it('files the direct and OpenRouter routes of one model under one canonical', () => {
    expect(fixtureRow('anthropic:claude-haiku-4-5').canonical).toBe(
      'anthropic/claude-haiku-4-5'
    );
    expect(fixtureRow('openrouter:anthropic/claude-haiku-4.5').canonical).toBe(
      'anthropic/claude-haiku-4-5'
    );
  });

  it('fixtureRow returns the row of a listed id', () => {
    expect(fixtureRow('openrouter:z-ai/glm-5.3').id).toBe(
      'openrouter:z-ai/glm-5.3'
    );
  });

  it('fixtureRow throws on an unknown id', () => {
    expect(() => fixtureRow('openrouter:vendor/unknown')).toThrow(
      'openrouter:vendor/unknown is not in the fixture index'
    );
  });
});
