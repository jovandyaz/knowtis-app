import { describe, expect, it } from 'vitest';

import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import { PlatformResolutionsUnreadError } from '../ports/platform-models.port';
import {
  byokProbeModelId,
  probeCandidateModelIds,
  systemProbeModelId,
} from './probe-model';

const rows = createSnapshotIndex().catalog().all();
const FAST_PIN = 'openrouter:deepseek/deepseek-v4.1-flash';
const BALANCED_PIN = 'openrouter:deepseek/deepseek-v4-pro-0813';
const ANTHROPIC_PIN = 'anthropic:claude-haiku-4-5';

describe('byokProbeModelId', () => {
  it.each([
    ['anthropic', 'anthropic:claude-haiku-4-5'],
    ['openai', 'openai:gpt-6-luna'],
    ['google', 'google:gemini-3.5-flash-lite'],
    ['openrouter', 'openrouter:anthropic/claude-haiku-4.5'],
  ] as const)('should resolve the fast route for %s', (provider, id) => {
    expect(byokProbeModelId(provider, rows, SNAPSHOT_DATE)).toBe(id);
  });

  it('should be null when no row serves the provider', () => {
    expect(byokProbeModelId('openai', [], SNAPSHOT_DATE)).toBeNull();
  });
});

describe('probeCandidateModelIds', () => {
  it('offers no platform model to a probe while the resolutions are unread', async () => {
    await expect(
      probeCandidateModelIds({
        getPlatformModelIds: async () => {
          throw new PlatformResolutionsUnreadError();
        },
      })
    ).resolves.toEqual([]);
  });

  it('lets any other read failure reject', async () => {
    await expect(
      probeCandidateModelIds({
        getPlatformModelIds: async () => {
          throw new Error('db down');
        },
      })
    ).rejects.toThrow('db down');
  });
});

describe('systemProbeModelId', () => {
  it('probes the first platform model on the provider', () => {
    expect(
      systemProbeModelId(
        'openrouter',
        [ANTHROPIC_PIN, FAST_PIN, BALANCED_PIN],
        rows,
        SNAPSHOT_DATE
      )
    ).toBe(FAST_PIN);
  });

  it('skips a platform model the index does not serve', () => {
    const delisted = 'openrouter:vendor/delisted-model';
    expect(
      systemProbeModelId(
        'openrouter',
        [delisted, FAST_PIN],
        rows,
        SNAPSHOT_DATE
      )
    ).toBe(FAST_PIN);
    expect(
      systemProbeModelId('openrouter', [delisted], rows, SNAPSHOT_DATE)
    ).toBe('openrouter:anthropic/claude-haiku-4.5');
  });

  it('probes the fast BYOK route of a provider no platform model uses', () => {
    expect(systemProbeModelId('openai', [FAST_PIN], rows, SNAPSHOT_DATE)).toBe(
      'openai:gpt-6-luna'
    );
  });

  it('probes nothing when neither exists', () => {
    expect(systemProbeModelId('openai', [], [], SNAPSHOT_DATE)).toBeNull();
  });
});
