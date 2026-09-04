import type { Editor } from '@tiptap/react';
import type { ParseKeys } from 'i18next';
import {
  Bold,
  CheckSquare,
  Code,
  CodeXml,
  Italic,
  List,
  ListOrdered,
  Minus,
  Redo,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table2,
  Underline,
  Undo,
} from 'lucide-react';

export interface ToolbarToolConfig {
  icon: typeof Bold;
  labelKey: ParseKeys<'notes'>;
  action: (editor: Editor) => void;
  /** Present on toggles only; one-shot actions (undo, insert rule) omit it. */
  isActive?: (editor: Editor) => boolean;
  disabled?: (editor: Editor) => boolean;
  shortcut?: string;
  /** Folds into the overflow menu when the toolbar container is narrow. */
  secondary?: boolean;
}

export interface ToolbarSeparatorConfig {
  type: 'separator';
  secondary?: boolean;
}

export interface ToolbarHeadingConfig {
  type: 'heading-dropdown';
}

export interface ToolbarLinkConfig {
  type: 'link-popover';
  shortcut?: string;
}

export interface ToolbarHighlightConfig {
  type: 'highlight-picker';
}

export interface ToolbarImageConfig {
  type: 'image-button';
}

export type ToolbarItemConfig =
  | ToolbarToolConfig
  | ToolbarSeparatorConfig
  | ToolbarHeadingConfig
  | ToolbarLinkConfig
  | ToolbarHighlightConfig
  | ToolbarImageConfig;

const DEFAULT_TABLE = { rows: 3, cols: 3, withHeaderRow: true } as const;

export const TOOLBAR_TOOLS: readonly ToolbarItemConfig[] = [
  { type: 'heading-dropdown' },
  { type: 'separator' },
  {
    icon: Bold,
    labelKey: 'editor.toolbar.bold',
    action: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive('bold'),
    shortcut: 'Ctrl+B',
  },
  {
    icon: Italic,
    labelKey: 'editor.toolbar.italic',
    action: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive('italic'),
    shortcut: 'Ctrl+I',
  },
  {
    icon: Underline,
    labelKey: 'editor.toolbar.underline',
    action: (editor) => editor.chain().focus().toggleUnderline().run(),
    isActive: (editor) => editor.isActive('underline'),
    shortcut: 'Ctrl+U',
  },
  {
    icon: Strikethrough,
    labelKey: 'editor.toolbar.strikethrough',
    action: (editor) => editor.chain().focus().toggleStrike().run(),
    isActive: (editor) => editor.isActive('strike'),
    shortcut: 'Ctrl+Shift+S',
  },
  { type: 'separator' },
  {
    icon: List,
    labelKey: 'editor.toolbar.bulletList',
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    icon: ListOrdered,
    labelKey: 'editor.toolbar.numberedList',
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    icon: CheckSquare,
    labelKey: 'editor.toolbar.taskList',
    action: (editor) => editor.chain().focus().toggleTaskList().run(),
    isActive: (editor) => editor.isActive('taskList'),
  },
  { type: 'separator' },
  {
    icon: Code,
    labelKey: 'editor.toolbar.inlineCode',
    action: (editor) => editor.chain().focus().toggleCode().run(),
    isActive: (editor) => editor.isActive('code'),
    shortcut: 'Ctrl+E',
    secondary: true,
  },
  {
    icon: CodeXml,
    labelKey: 'editor.toolbar.codeBlock',
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: (editor) => editor.isActive('codeBlock'),
    shortcut: 'Ctrl+Alt+C',
    secondary: true,
  },
  { type: 'separator', secondary: true },
  { type: 'link-popover', shortcut: 'Ctrl+K' },
  { type: 'highlight-picker' },
  {
    icon: SuperscriptIcon,
    labelKey: 'editor.toolbar.superscript',
    action: (editor) => editor.chain().focus().toggleSuperscript().run(),
    isActive: (editor) => editor.isActive('superscript'),
    shortcut: 'Ctrl+.',
    secondary: true,
  },
  {
    icon: SubscriptIcon,
    labelKey: 'editor.toolbar.subscript',
    action: (editor) => editor.chain().focus().toggleSubscript().run(),
    isActive: (editor) => editor.isActive('subscript'),
    shortcut: 'Ctrl+,',
    secondary: true,
  },
  {
    icon: Table2,
    labelKey: 'editor.table.insert',
    action: (editor) => editor.chain().focus().insertTable(DEFAULT_TABLE).run(),
  },
  { type: 'image-button' },
  {
    icon: Minus,
    labelKey: 'editor.toolbar.horizontalRule',
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
    secondary: true,
  },
  { type: 'separator', secondary: true },
  {
    icon: Undo,
    labelKey: 'editor.toolbar.undo',
    action: (editor) => editor.chain().focus().undo().run(),
    disabled: (editor) => !editor.can().undo(),
    secondary: true,
  },
  {
    icon: Redo,
    labelKey: 'editor.toolbar.redo',
    action: (editor) => editor.chain().focus().redo().run(),
    disabled: (editor) => !editor.can().redo(),
    secondary: true,
  },
];
