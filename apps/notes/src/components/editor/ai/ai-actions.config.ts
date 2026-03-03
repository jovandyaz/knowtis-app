import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  FileText,
  Languages,
  ListChecks,
  Sparkles,
  SpellCheck,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  AI_ACTION,
  type AIAction,
  type AILanguage,
  type AITone,
} from '@knowtis/shared-types';

export interface AIActionConfig {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  action: AIAction;
  needsSubMenu?: 'languages' | 'tones';
}

interface LanguageOption {
  value: AILanguage;
  labelKey: string;
}

interface ToneOption {
  value: AITone;
  labelKey: string;
}

export const AI_BUBBLE_ACTIONS: AIActionConfig[] = [
  {
    id: 'improve',
    icon: Wand2,
    labelKey: 'ai.actions.improveWriting',
    action: AI_ACTION.IMPROVE_WRITING,
  },
  {
    id: 'fix-spelling',
    icon: SpellCheck,
    labelKey: 'ai.actions.fixSpelling',
    action: AI_ACTION.FIX_SPELLING,
  },
  {
    id: 'shorter',
    icon: ArrowDownWideNarrow,
    labelKey: 'ai.actions.makeShorter',
    action: AI_ACTION.MAKE_SHORTER,
  },
  {
    id: 'longer',
    icon: ArrowUpWideNarrow,
    labelKey: 'ai.actions.makeLonger',
    action: AI_ACTION.MAKE_LONGER,
  },
  {
    id: 'summarize',
    icon: FileText,
    labelKey: 'ai.actions.summarize',
    action: AI_ACTION.SUMMARIZE,
  },
  {
    id: 'action-items',
    icon: ListChecks,
    labelKey: 'ai.actions.actionItems',
    action: AI_ACTION.ACTION_ITEMS,
  },
  {
    id: 'translate',
    icon: Languages,
    labelKey: 'ai.actions.translate',
    action: AI_ACTION.TRANSLATE,
    needsSubMenu: 'languages',
  },
  {
    id: 'tone',
    icon: Sparkles,
    labelKey: 'ai.actions.changeTone',
    action: AI_ACTION.TONE,
    needsSubMenu: 'tones',
  },
];

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { value: 'English', labelKey: 'ai.languages.english' },
  { value: 'Spanish', labelKey: 'ai.languages.spanish' },
  { value: 'French', labelKey: 'ai.languages.french' },
  { value: 'German', labelKey: 'ai.languages.german' },
  { value: 'Portuguese', labelKey: 'ai.languages.portuguese' },
  { value: 'Italian', labelKey: 'ai.languages.italian' },
  { value: 'Chinese', labelKey: 'ai.languages.chinese' },
  { value: 'Japanese', labelKey: 'ai.languages.japanese' },
  { value: 'Korean', labelKey: 'ai.languages.korean' },
] as const;

export const SUPPORTED_TONES: readonly ToneOption[] = [
  { value: 'formal', labelKey: 'ai.tones.formal' },
  { value: 'casual', labelKey: 'ai.tones.casual' },
  { value: 'professional', labelKey: 'ai.tones.professional' },
  { value: 'friendly', labelKey: 'ai.tones.friendly' },
  { value: 'academic', labelKey: 'ai.tones.academic' },
  { value: 'concise', labelKey: 'ai.tones.concise' },
  { value: 'creative', labelKey: 'ai.tones.creative' },
] as const;
