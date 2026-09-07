const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_SHIFT_1 = 15;
const MULBERRY_SHIFT_2 = 7;
const MULBERRY_ODD_MASK_2 = 61;
const MULBERRY_SHIFT_3 = 14;
const UINT32_RANGE = 4294967296;

export function hashSeed(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> MULBERRY_SHIFT_1), t | 1);
    t ^= t + Math.imul(t ^ (t >>> MULBERRY_SHIFT_2), t | MULBERRY_ODD_MASK_2);
    return ((t ^ (t >>> MULBERRY_SHIFT_3)) >>> 0) / UINT32_RANGE;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}
