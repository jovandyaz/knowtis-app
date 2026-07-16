import type { ModelTier } from '@knowtis/shared-types';

export interface CuratedModel {
  id: string;
  label: string;
  descriptionKey: string;
  tier: ModelTier;
}

export const CURATED_MODELS: CuratedModel[] = [
  {
    id: 'anthropic:claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    descriptionKey: 'aiModels.haiku45',
    tier: 'fast',
  },
  {
    id: 'openai:gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    descriptionKey: 'aiModels.gpt54mini',
    tier: 'fast',
  },
  {
    id: 'google:gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    descriptionKey: 'aiModels.gemini31FlashLite',
    tier: 'fast',
  },
  {
    id: 'anthropic:claude-sonnet-5',
    label: 'Sonnet 5',
    descriptionKey: 'aiModels.sonnet5',
    tier: 'balanced',
  },
  {
    id: 'openai:gpt-5.4',
    label: 'GPT-5.4',
    descriptionKey: 'aiModels.gpt54',
    tier: 'balanced',
  },
  {
    id: 'google:gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    descriptionKey: 'aiModels.gemini35Flash',
    tier: 'balanced',
  },
  {
    id: 'anthropic:claude-opus-4-8',
    label: 'Opus 4.8',
    descriptionKey: 'aiModels.opus48',
    tier: 'powerful',
  },
  {
    id: 'openai:gpt-5.6',
    label: 'GPT-5.6',
    descriptionKey: 'aiModels.gpt56',
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
    id: 'openrouter:qwen/qwen3-235b-a22b-2507',
    label: 'Qwen3 235B',
    descriptionKey: 'aiModels.qwen3235b',
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
