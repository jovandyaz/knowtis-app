import { describe, expect, it } from 'vitest';

import {
  containerMemoryLimitBytes,
  type MemoryLimitProbe,
} from '../container-memory-limit';

const HOST_RAM = 16 * 1024 ** 3;

function probeWith(constrained: number): MemoryLimitProbe {
  return { constrainedMemory: () => constrained, totalMemory: () => HOST_RAM };
}

describe('containerMemoryLimitBytes', () => {
  it('returns the cgroup limit the OS imposes on the process', () => {
    expect(containerMemoryLimitBytes(probeWith(536_870_912))).toBe(536_870_912);
  });

  it('falls back to host memory when Node reports no constraint', () => {
    expect(containerMemoryLimitBytes(probeWith(0))).toBe(HOST_RAM);
  });
});
