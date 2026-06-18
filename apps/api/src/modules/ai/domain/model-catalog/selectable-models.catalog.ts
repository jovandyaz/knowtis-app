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
    id: 'openai:gpt-4o-mini',
    label: 'GPT-4o mini',
    descriptionKey: 'aiModels.gpt4oMini',
    tier: 'fast',
  },
  {
    id: 'google:gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    descriptionKey: 'aiModels.gemini20Flash',
    tier: 'fast',
  },
  {
    id: 'anthropic:claude-sonnet-4-20250514',
    label: 'Sonnet 4',
    descriptionKey: 'aiModels.sonnet4',
    tier: 'balanced',
  },
];
