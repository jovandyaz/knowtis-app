export const DECK_CHIP_TONES = [
  'neutral',
  'projects',
  'areas',
  'resources',
  'archive',
] as const;

export type DeckChipTone = (typeof DECK_CHIP_TONES)[number];
