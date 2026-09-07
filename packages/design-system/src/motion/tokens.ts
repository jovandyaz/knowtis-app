export const MOTION_DURATION_S = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
} as const;

export const MOTION_EASING = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

// Springs have no CSS equivalent, so they live only here and never in motion.json.
export const SPRING = {
  flip: { type: 'spring', stiffness: 300, damping: 25 },
  slide: { type: 'spring', stiffness: 400, damping: 30 },
} as const;
