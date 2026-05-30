import { useAIStore } from '@/stores/ai.store';
import { useArtifactSidebarStore } from '@/stores/artifact-sidebar.store';
import { useVoiceNoteEditorStore } from '@/stores/voice-note-editor.store';
import type { Editor, Range } from '@tiptap/react';
import i18next from 'i18next';
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  FileText,
  GraduationCap,
  Languages,
  ListChecks,
  ListOrdered,
  Mic,
  PenLine,
  Sparkles,
  SpellCheck,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  AI_ACTION,
  type AIAction,
  type AILanguage,
  type AITone,
} from '@knowtis/shared-types';

export const AI_MENU_CONTEXT = {
  SELECTION: 'selection',
  CURSOR: 'cursor',
} as const;
export type AIMenuContext =
  (typeof AI_MENU_CONTEXT)[keyof typeof AI_MENU_CONTEXT];

type AISubmenu = 'languages' | 'tones';
type AIActionKind = 'stream' | 'aiBlock' | 'studyTools' | 'voiceNote';

export interface AIMenuActionConfig {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  descriptionKey?: string;
  contexts: readonly AIMenuContext[];
  keywords: readonly string[];
  kind: AIActionKind;
  action?: AIAction;
  submenu?: AISubmenu;
  requiresContent?: boolean;
}

interface LanguageOption {
  value: AILanguage;
  labelKey: string;
}

interface ToneOption {
  value: AITone;
  labelKey: string;
}

export const AI_MENU_ACTIONS: readonly AIMenuActionConfig[] = [
  {
    id: 'improve',
    icon: Wand2,
    labelKey: 'ai.actions.improveWriting',
    descriptionKey: 'ai.slash.improveDesc',
    contexts: [AI_MENU_CONTEXT.SELECTION],
    keywords: ['improve', 'mejorar', 'writing', 'redaccion'],
    kind: 'stream',
    action: AI_ACTION.IMPROVE_WRITING,
  },
  {
    id: 'fix-spelling',
    icon: SpellCheck,
    labelKey: 'ai.actions.fixSpelling',
    descriptionKey: 'ai.slash.fixSpellingDesc',
    contexts: [AI_MENU_CONTEXT.SELECTION],
    keywords: ['spelling', 'grammar', 'ortografia', 'gramatica', 'fix'],
    kind: 'stream',
    action: AI_ACTION.FIX_SPELLING,
  },
  {
    id: 'shorter',
    icon: ArrowDownWideNarrow,
    labelKey: 'ai.actions.makeShorter',
    descriptionKey: 'ai.slash.shorterDesc',
    contexts: [AI_MENU_CONTEXT.SELECTION],
    keywords: ['shorter', 'corto', 'condense'],
    kind: 'stream',
    action: AI_ACTION.MAKE_SHORTER,
  },
  {
    id: 'longer',
    icon: ArrowUpWideNarrow,
    labelKey: 'ai.actions.makeLonger',
    descriptionKey: 'ai.slash.longerDesc',
    contexts: [AI_MENU_CONTEXT.SELECTION],
    keywords: ['longer', 'largo', 'expand', 'elaborate'],
    kind: 'stream',
    action: AI_ACTION.MAKE_LONGER,
  },
  {
    id: 'action-items',
    icon: ListChecks,
    labelKey: 'ai.actions.actionItems',
    descriptionKey: 'ai.slash.actionItemsDesc',
    contexts: [AI_MENU_CONTEXT.SELECTION],
    keywords: ['action', 'items', 'tasks', 'tareas'],
    kind: 'stream',
    action: AI_ACTION.ACTION_ITEMS,
  },
  {
    id: 'translate',
    icon: Languages,
    labelKey: 'ai.actions.translate',
    descriptionKey: 'ai.slash.translateDesc',
    contexts: [AI_MENU_CONTEXT.SELECTION],
    keywords: ['translate', 'traducir', 'language', 'idioma'],
    kind: 'stream',
    action: AI_ACTION.TRANSLATE,
    submenu: 'languages',
  },
  {
    id: 'tone',
    icon: Sparkles,
    labelKey: 'ai.actions.changeTone',
    descriptionKey: 'ai.slash.changeToneDesc',
    contexts: [AI_MENU_CONTEXT.SELECTION],
    keywords: ['tone', 'tono', 'voice', 'style'],
    kind: 'stream',
    action: AI_ACTION.TONE,
    submenu: 'tones',
  },
  {
    id: 'summarize',
    icon: FileText,
    labelKey: 'ai.actions.summarize',
    descriptionKey: 'ai.slash.summarizeDesc',
    contexts: [AI_MENU_CONTEXT.SELECTION, AI_MENU_CONTEXT.CURSOR],
    keywords: ['summarize', 'summary', 'tldr', 'resumir'],
    kind: 'stream',
    action: AI_ACTION.SUMMARIZE,
    requiresContent: true,
  },
  {
    id: 'ai-continue',
    icon: PenLine,
    labelKey: 'ai.slash.continue',
    descriptionKey: 'ai.slash.continueDesc',
    contexts: [AI_MENU_CONTEXT.CURSOR],
    keywords: ['continue', 'write', 'extend', 'continuar'],
    kind: 'stream',
    action: AI_ACTION.GHOST_TEXT,
  },
  {
    id: 'ai-outline',
    icon: ListOrdered,
    labelKey: 'ai.slash.outline',
    descriptionKey: 'ai.slash.outlineDesc',
    contexts: [AI_MENU_CONTEXT.CURSOR],
    keywords: ['outline', 'structure', 'esquema'],
    kind: 'stream',
    action: AI_ACTION.OUTLINE,
    requiresContent: true,
  },
  {
    id: 'ai-learn',
    icon: GraduationCap,
    labelKey: 'ai.slash.learn',
    descriptionKey: 'ai.slash.learnDesc',
    contexts: [AI_MENU_CONTEXT.CURSOR],
    keywords: ['learn', 'aprender', 'topic', 'tema', 'research', 'investigar'],
    kind: 'aiBlock',
  },
  {
    id: 'ai-study-tools',
    icon: Sparkles,
    labelKey: 'ai.slash.studyTools',
    descriptionKey: 'ai.slash.studyToolsDesc',
    contexts: [AI_MENU_CONTEXT.CURSOR],
    keywords: [
      'study',
      'tools',
      'flashcards',
      'quiz',
      'herramientas',
      'estudio',
    ],
    kind: 'studyTools',
  },
  {
    id: 'ai-voice-note',
    icon: Mic,
    labelKey: 'ai.slash.voiceNote',
    descriptionKey: 'ai.slash.voiceNoteDesc',
    contexts: [AI_MENU_CONTEXT.CURSOR],
    keywords: ['voice', 'audio', 'record', 'dictate', 'voz', 'grabar'],
    kind: 'voiceNote',
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

export function getAIActionsForContext(
  context: AIMenuContext
): AIMenuActionConfig[] {
  return AI_MENU_ACTIONS.filter((action) => action.contexts.includes(context));
}

interface ExecuteAIActionParams {
  editor: Editor;
  config: AIMenuActionConfig;
  context: AIMenuContext;
  /** Slash-trigger range to remove before executing (omitted for toolbar/shortcut). */
  range?: Range;
  targetLanguage?: AILanguage;
  targetTone?: AITone;
}

interface StreamAIActionParams {
  editor: Editor;
  config: AIMenuActionConfig;
  context: AIMenuContext;
  targetLanguage: AILanguage | undefined;
  targetTone: AITone | undefined;
}

function streamAIAction({
  editor,
  config,
  context,
  targetLanguage,
  targetTone,
}: StreamAIActionParams): void {
  if (!config.action) {
    return;
  }

  const store = useAIStore.getState();
  const content = editor.state.doc.textContent;
  const target = {
    ...(targetLanguage ? { targetLanguage } : {}),
    ...(targetTone ? { targetTone } : {}),
  };

  if (context === AI_MENU_CONTEXT.SELECTION) {
    const { from, to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, ' ');
    store.setSelectionRange({ from, to });
    store.startStream({ action: config.action, content, selection, ...target });
    return;
  }

  if (config.requiresContent && !content.trim()) {
    toast.error(i18next.t('ai.contentGuard.emptyNote', { ns: 'notes' }));
    return;
  }

  const pos = editor.state.selection.to;
  store.setSelectionRange({ from: pos, to: pos });
  store.startStream({ action: config.action, content, ...target });
}

export function executeAIAction({
  editor,
  config,
  context,
  range,
  targetLanguage,
  targetTone,
}: ExecuteAIActionParams): void {
  if (range) {
    editor.chain().focus().deleteRange(range).run();
  }

  switch (config.kind) {
    case 'aiBlock': {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'aiBlock', attrs: { status: 'input' } })
        .run();
      return;
    }
    case 'studyTools': {
      useArtifactSidebarStore.getState().openGenerator();
      return;
    }
    case 'voiceNote': {
      const pos = editor.state.selection.to;
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          useVoiceNoteEditorStore.getState().open(pos, stream);
        })
        .catch((error) => {
          console.error('Failed to acquire microphone:', error);
          toast.error(i18next.t('ai.voice.micGenericError', { ns: 'notes' }));
        });
      return;
    }
    case 'stream': {
      streamAIAction({ editor, config, context, targetLanguage, targetTone });
      return;
    }
    default: {
      const _exhaustive: never = config.kind;
      throw new Error(`Unhandled AI action kind: ${String(_exhaustive)}`);
    }
  }
}
