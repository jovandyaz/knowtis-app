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
  /**
   * True when the server's own keys can invoke this model. False means only the
   * caller's BYOK key reaches it, so it is inert in any server-global config.
   */
  routableByServer: boolean;
}

export interface AIPreferences {
  preferredModel: string | null;
}

/**
 * Every provider the server can route to. BYOK_PROVIDERS is a subset — not
 * every provider supports a per-user key yet. Adding one here also needs a
 * migration widening the `system_provider_keys` provider CHECK.
 */
export const AI_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'openrouter',
] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const BYOK_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

/** Where the server-side key for a provider actually resolves from, in precedence order. */
export const PROVIDER_KEY_SOURCES = [
  'database',
  'environment',
  'none',
] as const;
export type ProviderKeySource = (typeof PROVIDER_KEY_SOURCES)[number];

export interface SystemProviderInfo {
  readonly provider: AIProvider;
  readonly enabled: boolean;
  readonly keySource: ProviderKeySource;
  /**
   * True when a stored secret exists but cannot be decrypted. Routing silently
   * falls through to `keySource`, so this must be surfaced, not hidden.
   */
  readonly storedKeyUnreadable: boolean;
  readonly keyPrefix: string | null;
  readonly updatedAt: string | null;
}

/**
 * Why a provider probe failed. 'rejected' and 'unconfigured' need an admin to
 * act; 'unavailable' is transient and worth retrying.
 */
export const PROVIDER_PROBE_FAILURES = [
  'rejected',
  'unavailable',
  'unconfigured',
] as const;
export type ProviderProbeFailure = (typeof PROVIDER_PROBE_FAILURES)[number];

/** A probe that ran and reports what happened — a refusal is an answer, not a transport error. */
export type ProviderTestResult =
  | { readonly ok: true; readonly model: string }
  | {
      readonly ok: false;
      readonly reason: ProviderProbeFailure;
      readonly message: string;
    };

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
