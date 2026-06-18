import { describe, expect, it, vi } from 'vitest';

import { aiModelsApi } from './ai-models.api';
import { httpClient } from './http-client';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn(), put: vi.fn() },
}));

describe('aiModelsApi', () => {
  it('getModels hits GET /ai/models', async () => {
    vi.mocked(httpClient.get).mockResolvedValue([]);
    await aiModelsApi.getModels();
    expect(httpClient.get).toHaveBeenCalledWith('/ai/models');
  });

  it('getPreferences hits GET /ai/preferences', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ preferredModel: null });
    await aiModelsApi.getPreferences();
    expect(httpClient.get).toHaveBeenCalledWith('/ai/preferences');
  });

  it('updatePreferences PUTs /ai/preferences', async () => {
    vi.mocked(httpClient.put).mockResolvedValue({ preferredModel: null });
    await aiModelsApi.updatePreferences({ preferredModel: null });
    expect(httpClient.put).toHaveBeenCalledWith('/ai/preferences', {
      preferredModel: null,
    });
  });
});
