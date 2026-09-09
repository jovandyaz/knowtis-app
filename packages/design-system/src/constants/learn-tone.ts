export const LEARN_TONES = [
  'primary',
  'correct',
  'incorrect',
  'muted',
  'danger',
] as const;

export type LearnTone = (typeof LEARN_TONES)[number];

export const RING_TONES = [
  'primary',
  'correct',
] as const satisfies readonly LearnTone[];

export type ProgressRingTone = (typeof RING_TONES)[number];

export const DONUT_TONES = [
  'correct',
  'incorrect',
  'muted',
] as const satisfies readonly LearnTone[];

export type DonutTone = (typeof DONUT_TONES)[number];

export const TONE_BUTTON_TONES = [
  'primary',
  'correct',
  'incorrect',
  'muted',
] as const satisfies readonly LearnTone[];

export type LearnToneButtonTone = (typeof TONE_BUTTON_TONES)[number];
