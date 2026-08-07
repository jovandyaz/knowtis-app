import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aiModelsApi } from './ai-models.api';
import { httpClient } from './http-client';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn(), put: vi.fn() },
}));

describe('aiModelsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getModels hits GET /ai/models', async () => {
    vi.mocked(httpClient.get).mockResolvedValue([]);
    await aiModelsApi.getModels();
    expect(httpClient.get).toHaveBeenCalledWith('/ai/models');
  });

  it('getPreferences hits GET /ai/preferences', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      preferredModel: null,
      preferredIntent: null,
    });
    await aiModelsApi.getPreferences();
    expect(httpClient.get).toHaveBeenCalledWith('/ai/preferences');
  });

  it('updatePreferences PUTs /ai/preferences', async () => {
    vi.mocked(httpClient.put).mockResolvedValue({
      preferredModel: null,
      preferredIntent: null,
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
