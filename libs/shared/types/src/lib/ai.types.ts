export const AI_ACTION = {
  SUMMARIZE: 'summarize',
  EXPAND: 'expand',
  TRANSLATE: 'translate',
  TONE: 'tone',
  OUTLINE: 'outline',
  ACTION_ITEMS: 'action-items',
  GHOST_TEXT: 'ghost-text',
  CHAT: 'chat',
  IMPROVE_WRITING: 'improve-writing',
  FIX_SPELLING: 'fix-spelling',
  MAKE_SHORTER: 'make-shorter',
  MAKE_LONGER: 'make-longer',
  VOICE_TRANSCRIPTION: 'voice-transcription',
  STRUCTURE_VOICE_NOTE: 'structure-voice-note',
} as const;

export const AI_ACTIONS = Object.values(AI_ACTION);

export type AIAction = (typeof AI_ACTIONS)[number];

export const AI_LANGUAGES = [
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

export type AILanguage = (typeof AI_LANGUAGES)[number];

export const AI_TONES = [
  'formal',
  'casual',
  'professional',
  'friendly',
  'academic',
  'concise',
  'creative',
  'persuasive',
] as const;

export type AITone = (typeof AI_TONES)[number];
