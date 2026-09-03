import { totalmem } from 'node:os';

/** Injection token for the RSS ceiling, in bytes, that /health reports against. */
export const RSS_LIMIT_BYTES = 'HEALTH_RSS_LIMIT_BYTES';

const RSS_LIMIT_RATIO = 0.9;

export interface MemoryLimitProbe {
  /** process.constrainedMemory: cgroup limit in bytes; 0 or UINT64_MAX when unconstrained. */
  constrainedMemory: () => number;
  totalMemory: () => number;
}

const systemProbe: MemoryLimitProbe = {
  constrainedMemory: () => process.constrainedMemory(),
  totalMemory: totalmem,
};

/**
 * Bytes the container may use before it is OOM-killed. Falls back to host RAM
 * when the OS imposes no limit, whether libuv reports that as 0 (a developer
 * machine) or as UINT64_MAX (a cgroup leaf whose memory.max is "max").
 */
export function containerMemoryLimitBytes(
  probe: MemoryLimitProbe = systemProbe
): number {
  const total = probe.totalMemory();
  const constrained = probe.constrainedMemory();
  return constrained > 0 && constrained < total ? constrained : total;
}

/**
 * RSS ceiling for /health: 90% of the container limit, so the check reports
 * "down" before the kernel OOM-kills the process rather than after.
 */
export function rssLimitBytes(): number {
  return Math.floor(containerMemoryLimitBytes() * RSS_LIMIT_RATIO);
}
