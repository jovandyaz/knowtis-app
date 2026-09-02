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
  SUGGEST_ORGANIZATION: 'suggest-organization',
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

/** User-facing capability choice; the `open` tier is the free pool backing these, never a selectable intent. */
export const MODEL_INTENTS = [
  'fast',
  'balanced',
  'powerful',
] as const satisfies readonly ModelTier[];
export type ModelIntent = (typeof MODEL_INTENTS)[number];

export const DEFAULT_MODEL_INTENT: ModelIntent = 'balanced';

export function isModelIntent(value: string): value is ModelIntent {
  return (MODEL_INTENTS as readonly string[]).includes(value);
}

export const MODEL_ACCESS = [
  'granted',
  'requires_byok',
  'requires_account',
] as const;
export type ModelAccess = (typeof MODEL_ACCESS)[number];

/** How much hidden reasoning budget a reasoning model may spend before emitting visible tokens. */
export const REASONING_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

/** Range the backoffice global setting accepts — deliberately narrower than per-model levels. */
export const GLOBAL_REASONING_EFFORTS = ['low', 'medium', 'high'] as const;
export type GlobalReasoningEffort = (typeof GLOBAL_REASONING_EFFORTS)[number];

export function isGlobalReasoningEffort(
  value: string
): value is GlobalReasoningEffort {
  return (GLOBAL_REASONING_EFFORTS as readonly string[]).includes(value);
}

export interface ModelReasoning {
  levels: readonly ReasoningEffort[];
  /** True when the model cannot run with reasoning off (e.g. GLM-5.3, Kimi K3). */
  mandatory: boolean;
}

/** Why an agent turn stopped; carried on the `done` event and, persisted, on the last assistant message of a turn. */
export const AGENT_STOP_REASON = {
  COMPLETED: 'completed',
  MAX_STEPS: 'max_steps',
  LENGTH: 'length',
  TOKEN_BUDGET: 'token_budget',
  CONTENT_FILTER: 'content_filter',
} as const;
export type AgentStopReason =
  (typeof AGENT_STOP_REASON)[keyof typeof AGENT_STOP_REASON];

/** Persisted stop reason: every loop stop reason plus the two interrupted outcomes. */
export const MESSAGE_STOP_REASON = [
  ...Object.values(AGENT_STOP_REASON),
  'error',
  'aborted',
] as const;
export type MessageStopReason = (typeof MESSAGE_STOP_REASON)[number];

/** Where an AI config key's served value comes from; `stale` means a row is stored but the runtime ignores it and serves the code default. */
export const AI_CONFIG_SOURCES = ['custom', 'default', 'stale'] as const;
export type AIConfigSource = (typeof AI_CONFIG_SOURCES)[number];

export const CHAIN_SEPARATOR = ',';

/** Splits a separator-delimited model chain into trimmed, non-empty ids — the wire format shared by the API and the backoffice editor. */
export function parseChain(value: string): string[] {
  return value
    .split(CHAIN_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface SelectableModel {
  id: string;
  label: string;
  descriptionKey: string;
  /** Free text served by catalog models that have no i18n key; the UI renders it when `descriptionKey` is empty. */
  description?: string;
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
  /** Whether this caller may run the model: open tier is free for everyone; other tiers need the caller's own provider key while tier gating is on. */
  access: ModelAccess;
  reasoning?: ModelReasoning;
  servesIntent?: ModelIntent;
}

export interface AIPreferences {
  preferredModel: string | null;
  preferredIntent: ModelIntent | null;
}

export type UpdateAiPreferencesInput = Partial<AIPreferences>;

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

export const BYOK_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'openrouter',
] as const;
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

/**
 * Outcome of probing a just-saved system provider key. Informational: the key
 * is stored either way, since the provider may be briefly down when the admin
 * saves it.
 */
export interface ProviderKeyProbeResult {
  readonly valid: boolean;
  readonly error?: string;
}

export interface SetSystemProviderResult {
  readonly providers: SystemProviderInfo[];
  /** Present only when the request carried a candidate key. */
  readonly probe?: ProviderKeyProbeResult;
}

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
