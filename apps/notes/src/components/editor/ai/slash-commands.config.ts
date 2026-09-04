import { useAIStore } from '@/stores/ai.store';
import type { Editor, Range } from '@tiptap/react';
import {
  CheckSquare,
  GitBranch,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  Quote,
  Table2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { openImagePicker } from '../image/imagePicker';
import {
  AI_MENU_CONTEXT,
  executeAIAction,
  getAIActionsForContext,
} from './ai-actions.config';

type SlashCommandGroup = 'ai' | 'formatting';

export interface SlashCommandItem {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  descriptionKey: string;
  group: SlashCommandGroup;
  keywords: string[];
  action: (editor: Editor, range: Range) => void;
}

function buildAISlashCommands(voiceNotesEnabled: boolean): SlashCommandItem[] {
  return getAIActionsForContext(AI_MENU_CONTEXT.CURSOR, {
    voiceNotesEnabled,
  }).map((config) => ({
    id: config.id,
    icon: config.icon,
    labelKey: config.labelKey,
    descriptionKey: config.descriptionKey ?? config.labelKey,
    group: 'ai',
    keywords: [...config.keywords],
    action: (editor, range) =>
      executeAIAction({
        editor,
        config,
        context: AI_MENU_CONTEXT.CURSOR,
        range,
      }),
  }));
}

const FORMATTING_SLASH_COMMANDS: SlashCommandItem[] = [
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
  {
    id: 'task-list',
    icon: CheckSquare,
    labelKey: 'ai.slash.taskList',
    descriptionKey: 'ai.slash.taskListDesc',
    group: 'formatting',
    keywords: ['task', 'todo', 'checkbox', 'checklist', 'tarea'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: 'table',
    icon: Table2,
    labelKey: 'ai.slash.table',
    descriptionKey: 'ai.slash.tableDesc',
    group: 'formatting',
    keywords: ['table', 'grid', 'tabla'],
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    id: 'diagram',
    icon: GitBranch,
    labelKey: 'ai.slash.diagram',
    descriptionKey: 'ai.slash.diagramDesc',
    group: 'formatting',
    keywords: ['diagram', 'mermaid', 'flowchart', 'diagrama', 'flujo'],
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: 'mermaidBlock',
            attrs: {
              code: 'graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Result A]\n  B -->|No| D[Result B]',
            },
          },
          { type: 'paragraph' },
        ])
        .run();
    },
  },
  {
    id: 'image',
    icon: ImageIcon,
    labelKey: 'ai.slash.image',
    descriptionKey: 'ai.slash.imageDesc',
    group: 'formatting',
    keywords: ['image', 'photo', 'picture', 'imagen', 'foto'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      openImagePicker((file) => editor.commands.uploadImageFile(file));
    },
  },
];

const SLASH_COMMANDS_WITH_VOICE: SlashCommandItem[] = [
  ...buildAISlashCommands(true),
  ...FORMATTING_SLASH_COMMANDS,
];

const SLASH_COMMANDS_WITHOUT_VOICE: SlashCommandItem[] = [
  ...buildAISlashCommands(false),
  ...FORMATTING_SLASH_COMMANDS,
];

export function filterSlashCommands(query: string): SlashCommandItem[] {
  const commands = useAIStore.getState().voiceNotesEnabled
    ? SLASH_COMMANDS_WITH_VOICE
    : SLASH_COMMANDS_WITHOUT_VOICE;

  if (!query) {
    return commands;
  }

  const normalizedQuery = query.toLowerCase();

  return commands.filter((item) => {
    const matchesId = item.id.toLowerCase().includes(normalizedQuery);
    const matchesKeywords = item.keywords.some((keyword) =>
      keyword.toLowerCase().includes(normalizedQuery)
    );
    return matchesId || matchesKeywords;
  });
}
