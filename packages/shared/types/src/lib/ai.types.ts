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
  GENERATE_FLASHCARDS: 'generate-flashcards',
  GENERATE_QUIZ: 'generate-quiz',
  GENERATE_SUMMARY: 'generate-summary',
  GENERATE_MIND_MAP: 'generate-mind-map',
  GENERATE_OUTLINE: 'generate-outline',
  LEARN_TOPIC: 'learn-topic',
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

export const MODEL_ID_MAX_LENGTH = 120;

export const MODEL_TIERS = ['fast', 'balanced', 'powerful', 'open'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export interface SelectableModel {
  id: string;
  label: string;
  descriptionKey: string;
  tier: ModelTier;
  contextWindow: number;
  costClass: 1 | 2 | 3;
  isDefault: boolean;
  /** True when the user has a stored BYOK key for this model's provider, so the turn bills their key. */
  billedToUser: boolean;
}

export interface AIPreferences {
  preferredModel: string | null;
}

export const BYOK_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export interface ProviderKeyInfo {
  readonly provider: ByokProvider;
  readonly keyPrefix: string;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
}

export interface EncryptedSecret {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
}
