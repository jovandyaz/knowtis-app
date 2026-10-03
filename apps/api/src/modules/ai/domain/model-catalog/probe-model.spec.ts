import { describe, expect, it } from 'vitest';

import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import { byokProbeModelId, systemProbeModelId } from './probe-model';

const rows = createSnapshotIndex().catalog().all();

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

describe('systemProbeModelId', () => {
  it('should probe the platform floor model of the provider', () => {
    expect(systemProbeModelId('openrouter', rows, SNAPSHOT_DATE)).toBe(
      'openrouter:deepseek/deepseek-v3.2'
    );
  });

  it('should fall back to the fast BYOK route when the platform has no floor model there', () => {
    expect(systemProbeModelId('openai', rows, SNAPSHOT_DATE)).toBe(
      'openai:gpt-6-luna'
    );
  });

  it('should be null when neither a floor model nor a route exists', () => {
    expect(systemProbeModelId('openai', [], SNAPSHOT_DATE)).toBeNull();
  });
});
