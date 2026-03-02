export const SUPPORTED_LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
  'Dutch',
  'Russian',
  'Chinese',
  'Japanese',
  'Korean',
  'Arabic',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
