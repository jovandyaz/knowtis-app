export const SUPPORTED_TONES = [
  'formal',
  'casual',
  'professional',
  'friendly',
  'academic',
  'concise',
  'creative',
  'persuasive',
] as const;

export type SupportedTone = (typeof SUPPORTED_TONES)[number];
