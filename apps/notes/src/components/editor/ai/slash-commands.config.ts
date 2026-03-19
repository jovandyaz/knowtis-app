import { dispatchKnowtisEvent } from '@/lib';
import { useAIStore } from '@/stores/ai.store';
import { useVoiceNoteEditorStore } from '@/stores/voice-note-editor.store';
import type { Editor, Range } from '@tiptap/react';
import i18next from 'i18next';
import {
  FileText,
  GraduationCap,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Mic,
  PenLine,
  Quote,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  AI_ACTION,
  type AIAction,
  type ArtifactType,
} from '@knowtis/shared-types';

import { ARTIFACT_DISPLAY } from '../../artifacts/artifact-display.config';

type SlashCommandGroup = 'ai' | 'formatting' | 'artifacts';

function createArtifactSlashAction(
  type: ArtifactType
): (editor: Editor, range: Range) => void {
  return (editor, range) => {
    editor.chain().focus().deleteRange(range).run();
    dispatchKnowtisEvent('knowtis:generate-artifact', { type });
  };
}

function createAISlashAction(
  action: AIAction
): (editor: Editor, range: Range) => void {
  return (editor, range) => {
    editor.chain().focus().deleteRange(range).run();
    const pos = editor.state.selection.to;
    const store = useAIStore.getState();
    store.setSelectionRange({ from: pos, to: pos });
    store.startStream({
      action,
      content: editor.state.doc.textContent,
    });
  };
}

export interface SlashCommandItem {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  descriptionKey: string;
  group: SlashCommandGroup;
  keywords: string[];
  action: (editor: Editor, range: Range) => void;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'ai-voice-note',
    icon: Mic,
    labelKey: 'ai.slash.voiceNote',
    descriptionKey: 'ai.slash.voiceNoteDesc',
    group: 'ai',
    keywords: [
      'voice',
      'audio',
      'record',
      'dictate',
      'voz',
      'grabar',
      'nota de voz',
    ],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const pos = editor.state.selection.to;
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          useVoiceNoteEditorStore.getState().open(pos, stream);
        })
        .catch(() => {
          toast.error(i18next.t('ai.voice.micGenericError', { ns: 'notes' }));
        });
    },
  },
  {
    id: 'ai-summarize',
    icon: FileText,
    labelKey: 'ai.slash.summarize',
    descriptionKey: 'ai.slash.summarizeDesc',
    group: 'ai',
    keywords: ['summarize', 'summary', 'tldr', 'resumir'],
    action: createAISlashAction(AI_ACTION.SUMMARIZE),
  },
  {
    id: 'ai-outline',
    icon: ListOrdered,
    labelKey: 'ai.slash.outline',
    descriptionKey: 'ai.slash.outlineDesc',
    group: 'ai',
    keywords: ['outline', 'structure', 'esquema'],
    action: createAISlashAction(AI_ACTION.OUTLINE),
  },
  {
    id: 'ai-improve',
    icon: Wand2,
    labelKey: 'ai.slash.improve',
    descriptionKey: 'ai.slash.improveDesc',
    group: 'ai',
    keywords: ['improve', 'enhance', 'mejorar', 'writing'],
    action: createAISlashAction(AI_ACTION.IMPROVE_WRITING),
  },
  {
    id: 'ai-continue',
    icon: PenLine,
    labelKey: 'ai.slash.continue',
    descriptionKey: 'ai.slash.continueDesc',
    group: 'ai',
    keywords: ['continue', 'write', 'extend', 'continuar'],
    action: createAISlashAction(AI_ACTION.GHOST_TEXT),
  },

  // Artifact generation commands
  {
    id: 'artifact-flashcards',
    icon: ARTIFACT_DISPLAY.flashcard_deck.icon,
    labelKey: 'ai.slash.flashcards',
    descriptionKey: 'ai.slash.flashcardsDesc',
    group: 'artifacts',
    keywords: ['flashcards', 'cards', 'study', 'tarjetas', 'estudiar', 'deck'],
    action: createArtifactSlashAction('flashcard_deck'),
  },
  {
    id: 'artifact-quiz',
    icon: ARTIFACT_DISPLAY.quiz.icon,
    labelKey: 'ai.slash.quiz',
    descriptionKey: 'ai.slash.quizDesc',
    group: 'artifacts',
    keywords: [
      'quiz',
      'test',
      'questions',
      'examen',
      'preguntas',
      'cuestionario',
    ],
    action: createArtifactSlashAction('quiz'),
  },
  {
    id: 'artifact-mindmap',
    icon: ARTIFACT_DISPLAY.mind_map.icon,
    labelKey: 'ai.slash.mindMap',
    descriptionKey: 'ai.slash.mindMapDesc',
    group: 'artifacts',
    keywords: ['mind map', 'mapa mental', 'diagram', 'diagrama', 'tree'],
    action: createArtifactSlashAction('mind_map'),
  },
  {
    id: 'artifact-learn',
    icon: GraduationCap,
    labelKey: 'ai.slash.learn',
    descriptionKey: 'ai.slash.learnDesc',
    group: 'artifacts',
    keywords: ['learn', 'aprender', 'topic', 'tema', 'research', 'investigar'],
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'aiBlock', attrs: { status: 'input' } })
        .run();
    },
  },

  {
    id: 'heading-1',
    icon: Heading1,
    labelKey: 'ai.slash.heading1',
    descriptionKey: 'ai.slash.heading1Desc',
    group: 'formatting',
    keywords: ['heading', 'h1', 'title', 'titulo'],
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 1 })
        .run();
    },
  },
  {
    id: 'heading-2',
    icon: Heading2,
    labelKey: 'ai.slash.heading2',
    descriptionKey: 'ai.slash.heading2Desc',
    group: 'formatting',
    keywords: ['heading', 'h2', 'subtitle', 'subtitulo'],
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 2 })
        .run();
    },
  },
  {
    id: 'heading-3',
    icon: Heading3,
    labelKey: 'ai.slash.heading3',
    descriptionKey: 'ai.slash.heading3Desc',
    group: 'formatting',
    keywords: ['heading', 'h3', 'section', 'seccion'],
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 3 })
        .run();
    },
  },
  {
    id: 'bullet-list',
    icon: List,
    labelKey: 'ai.slash.bulletList',
    descriptionKey: 'ai.slash.bulletListDesc',
    group: 'formatting',
    keywords: ['bullet', 'list', 'unordered', 'lista'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'numbered-list',
    icon: ListOrdered,
    labelKey: 'ai.slash.numberedList',
    descriptionKey: 'ai.slash.numberedListDesc',
    group: 'formatting',
    keywords: ['numbered', 'ordered', 'list', 'numerada'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: 'blockquote',
    icon: Quote,
    labelKey: 'ai.slash.blockquote',
    descriptionKey: 'ai.slash.blockquoteDesc',
    group: 'formatting',
    keywords: ['quote', 'blockquote', 'cita'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
];

export function filterSlashCommands(query: string): SlashCommandItem[] {
  if (!query) {
    return SLASH_COMMANDS;
  }

  const normalizedQuery = query.toLowerCase();

  return SLASH_COMMANDS.filter((item) => {
    const matchesId = item.id.toLowerCase().includes(normalizedQuery);
    const matchesKeywords = item.keywords.some((keyword) =>
      keyword.toLowerCase().includes(normalizedQuery)
    );
    return matchesId || matchesKeywords;
  });
}
