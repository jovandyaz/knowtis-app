import { PARA_BUCKETS, type ParaBucket } from '@knowtis/shared-types';

/** Every tone a deck chip draws: its PARA bucket, or none. A deck is never in the inbox. */
export const DECK_CHIP_TONES = ['neutral', ...PARA_BUCKETS] as const;

export type DeckChipTone = ParaBucket | 'neutral';
