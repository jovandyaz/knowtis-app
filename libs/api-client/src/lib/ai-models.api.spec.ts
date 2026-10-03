import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ModelCatalogResponse,
  SelectableModel,
} from '@knowtis/shared-types';

import { aiModelsApi } from './ai-models.api';
import { httpClient } from './http-client';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn(), put: vi.fn() },
}));

describe('aiModelsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const MODEL: SelectableModel = {
    id: 'openrouter:deepseek/deepseek-v3.2',
    label: 'DeepSeek V3.2',
    descriptionKey: '',
    tier: 'open',
    contextWindow: 128_000,
    costClass: 1,
    isDefault: true,
    billedToUser: false,
    routableByServer: true,
    servesIntent: 'balanced',
  };

  const OWN_KEY_MODEL: SelectableModel = {
    id: 'openai:gpt-6',
    label: 'GPT-6',
    descriptionKey: '',
    tier: 'powerful',
    contextWindow: 400_000,
    costClass: 3,
    isDefault: false,
    billedToUser: true,
    routableByServer: false,
  };

  const CATALOG: ModelCatalogResponse = {
    tier: 'byok',
    models: [MODEL, OWN_KEY_MODEL],
    intents: [
      {
        intent: 'balanced',
        available: true,
        modelId: MODEL.id,
        substituted: false,
      },
      { intent: 'powerful', available: false, reason: 'no_route' },
    ],
  };

  const withModel = (model: unknown) => ({ ...CATALOG, models: [model] });
  const withIntent = (intent: unknown) => ({ ...CATALOG, intents: [intent] });

  it('getModels hits GET /ai/models', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(CATALOG);
    await aiModelsApi.getModels();
    expect(httpClient.get).toHaveBeenCalledWith('/ai/models');
  });

  it('getModels returns the tier envelope unchanged', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(CATALOG);

    await expect(aiModelsApi.getModels()).resolves.toEqual(CATALOG);
  });

  it('getModels drops an intent this build does not know and keeps the rest', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...CATALOG,
      intents: [
        {
          intent: 'turbo',
          available: true,
          modelId: MODEL.id,
          substituted: false,
        },
        ...CATALOG.intents,
      ],
    });

    await expect(aiModelsApi.getModels()).resolves.toEqual(CATALOG);
  });

  it('getModels keeps an intent unavailable for a reason this build does not know', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...CATALOG,
      intents: [
        CATALOG.intents[0],
        { intent: 'powerful', available: false, reason: 'quota_exhausted' },
      ],
    });

    await expect(aiModelsApi.getModels()).resolves.toEqual(CATALOG);
  });

  it('getModels keeps a model serving an intent this build does not know, as a plain model', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...CATALOG,
      models: [MODEL, { ...OWN_KEY_MODEL, servesIntent: 'turbo' }],
    });

    const catalog = await aiModelsApi.getModels();

    expect(catalog.models[1]).toStrictEqual(OWN_KEY_MODEL);
    expect(catalog.models[0]).toStrictEqual(MODEL);
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
    ['a model that is not an object', withModel(null)],
    ['a model without a string id', withModel({ ...MODEL, id: 7 })],
    ['a model without a label', withModel({ ...MODEL, label: undefined })],
    [
      'a model that does not say who is billed',
      withModel({ ...MODEL, billedToUser: 'yes' }),
    ],
    [
      'a model whose served intent is not a string',
      withModel({ ...MODEL, servesIntent: 7 }),
    ],
    ['an intent entry that is not an object', withIntent(null)],
    [
      'an intent entry without a string intent',
      withIntent({ intent: 7, available: false, reason: 'no_route' }),
    ],
    [
      'an intent entry that does not say whether it is available',
      withIntent({ intent: 'fast', reason: 'no_route' }),
    ],
    [
      'an available intent without its model',
      withIntent({ intent: 'fast', available: true, substituted: false }),
    ],
    [
      'an available intent that does not say whether it was substituted',
      withIntent({ intent: 'fast', available: true, modelId: MODEL.id }),
    ],
    [
      'an unavailable intent without its reason',
      withIntent({ intent: 'fast', available: false }),
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
