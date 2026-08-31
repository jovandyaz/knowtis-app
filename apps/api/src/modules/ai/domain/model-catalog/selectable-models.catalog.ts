import type { ModelTier } from '@knowtis/shared-types';

/** Namespace every OpenRouter model id carries: this prefix followed by the upstream slug. */
export const OPENROUTER_ID_PREFIX = 'openrouter:';

export interface CuratedModel {
  id: string;
  label: string;
  descriptionKey: string;
  tier: ModelTier;
}

export const CURATED_MODELS: readonly CuratedModel[] = [
  {
    id: 'anthropic:claude-haiku-4-5',
    label: 'Haiku 4.5',
    descriptionKey: 'aiModels.haiku45',
    tier: 'fast',
  },
  {
    id: 'openai:gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    descriptionKey: 'aiModels.gpt56Luna',
    tier: 'fast',
  },
  {
    id: 'google:gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    descriptionKey: 'aiModels.gemini35FlashLite',
    tier: 'fast',
  },
  {
    id: 'anthropic:claude-sonnet-5',
    label: 'Sonnet 5',
    descriptionKey: 'aiModels.sonnet5',
    tier: 'balanced',
  },
  {
    id: 'openai:gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    descriptionKey: 'aiModels.gpt56Terra',
    tier: 'balanced',
  },
  {
    id: 'google:gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
    descriptionKey: 'aiModels.gemini37Flash',
    tier: 'balanced',
  },
  {
    id: 'anthropic:claude-opus-5',
    label: 'Opus 5',
    descriptionKey: 'aiModels.opus5',
    tier: 'powerful',
  },
  {
    id: 'openai:gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    descriptionKey: 'aiModels.gpt56Sol',
    tier: 'powerful',
  },
  {
    id: 'google:gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    descriptionKey: 'aiModels.gemini31Pro',
    tier: 'powerful',
  },
  {
    id: 'openrouter:deepseek/deepseek-v3.2',
    label: 'DeepSeek V3.2',
    descriptionKey: 'aiModels.deepseekV32',
    tier: 'open',
  },
  {
    id: 'openrouter:z-ai/glm-5.2',
    label: 'GLM-5.2',
    descriptionKey: 'aiModels.glm52',
    tier: 'open',
  },
  {
    id: 'openrouter:moonshotai/kimi-k2.5',
    label: 'Kimi K2.5',
    descriptionKey: 'aiModels.kimiK25',
    tier: 'open',
  },
  {
    id: 'openrouter:minimax/minimax-m2.5',
    label: 'MiniMax M2.5',
    descriptionKey: 'aiModels.minimaxM25',
    tier: 'open',
  },
];

/** Ids code already owns; a promoted DB row sharing one must never override it. */
export const CURATED_MODEL_IDS: ReadonlySet<string> = new Set(
  CURATED_MODELS.map((m) => m.id)
);
