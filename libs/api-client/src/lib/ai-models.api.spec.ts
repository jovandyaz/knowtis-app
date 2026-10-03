import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelCatalogResponse } from '@knowtis/shared-types';

import { aiModelsApi } from './ai-models.api';
import { httpClient } from './http-client';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn(), put: vi.fn() },
}));

describe('aiModelsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const CATALOG: ModelCatalogResponse = {
    tier: 'free',
    models: [],
    intents: [{ intent: 'balanced', available: false, reason: 'no_route' }],
  };

  it('getModels hits GET /ai/models', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(CATALOG);
    await aiModelsApi.getModels();
    expect(httpClient.get).toHaveBeenCalledWith('/ai/models');
  });

  it('getModels returns the tier envelope unchanged', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(CATALOG);

    await expect(aiModelsApi.getModels()).resolves.toEqual(CATALOG);
  });

  it.each([
    ['nothing', null],
    [
      'a bare array, which no API has answered since the tier catalog',
      [{ id: 'openrouter:vendor/model' }],
    ],
    ['an envelope without a tier', { models: [], intents: [] }],
    [
      'an envelope with a tier this client does not know',
      { tier: 'gold', models: [], intents: [] },
    ],
    ['an envelope without intents', { tier: 'free', models: [] }],
    [
      'an envelope whose models are not a list',
      { tier: 'free', models: 'x', intents: [] },
    ],
  ])('getModels rejects %s', async (_shape, body) => {
    vi.mocked(httpClient.get).mockResolvedValue(body);

    await expect(aiModelsApi.getModels()).rejects.toThrow(
      'Malformed /ai/models response'
    );
  });

  it('getPreferences hits GET /ai/preferences', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      preferredModel: null,
      preferredIntent: null,
      primaryProvider: null,
      ghostTextEnabled: true,
    });
    await aiModelsApi.getPreferences();
    expect(httpClient.get).toHaveBeenCalledWith('/ai/preferences');
  });

  it('updatePreferences PUTs /ai/preferences', async () => {
    vi.mocked(httpClient.put).mockResolvedValue({
      preferredModel: null,
      preferredIntent: null,
      primaryProvider: null,
      ghostTextEnabled: true,
    });
    await aiModelsApi.updatePreferences({
      preferredModel: null,
      preferredIntent: null,
    });
    expect(httpClient.put).toHaveBeenCalledWith('/ai/preferences', {
      preferredModel: null,
      preferredIntent: null,
    });
  });

  it('updatePreferences forwards a partial patch untouched', async () => {
    vi.mocked(httpClient.put).mockResolvedValue({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'fast',
      primaryProvider: null,
      ghostTextEnabled: false,
    });
    await aiModelsApi.updatePreferences({ preferredIntent: 'fast' });
    expect(httpClient.put).toHaveBeenCalledWith('/ai/preferences', {
      preferredIntent: 'fast',
    });
  });

  it('getModels propagates http errors', async () => {
    vi.mocked(httpClient.get).mockRejectedValueOnce(new Error('network'));
    await expect(aiModelsApi.getModels()).rejects.toThrow('network');
  });

  it('updatePreferences propagates http errors', async () => {
    vi.mocked(httpClient.put).mockRejectedValueOnce(new Error('network'));
    await expect(
      aiModelsApi.updatePreferences({ preferredModel: null })
    ).rejects.toThrow('network');
  });
});
