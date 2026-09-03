import { totalmem } from 'node:os';

/** Injection token for the RSS ceiling, in bytes, that /health reports against. */
export const RSS_LIMIT_BYTES = 'HEALTH_RSS_LIMIT_BYTES';

const RSS_LIMIT_RATIO = 0.9;

export interface MemoryLimitProbe {
  /** process.constrainedMemory: cgroup limit in bytes, 0 when unconstrained. */
  constrainedMemory: () => number;
  totalMemory: () => number;
}

const systemProbe: MemoryLimitProbe = {
  constrainedMemory: () => process.constrainedMemory(),
  totalMemory: totalmem,
};

/**
 * Bytes the container may use before it is OOM-killed. Falls back to host RAM
 * when the OS imposes no limit, which is what a developer machine reports.
 */
export function containerMemoryLimitBytes(
  probe: MemoryLimitProbe = systemProbe
): number {
  const constrained = probe.constrainedMemory();
  return constrained > 0 ? constrained : probe.totalMemory();
}

/**
 * RSS ceiling for /health: 90% of the container limit, so the check reports
 * "down" before the kernel OOM-kills the process rather than after.
 */
export function rssLimitBytes(): number {
  return Math.floor(containerMemoryLimitBytes() * RSS_LIMIT_RATIO);
}
