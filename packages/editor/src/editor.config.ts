import type { Editor } from '@tiptap/react';
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
  Underline,
  Undo,
} from 'lucide-react';

export interface ToolbarToolConfig {
  icon: typeof Bold;
  label: string;
  action: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
  disabled?: (editor: Editor) => boolean;
  shortcut?: string;
  hideOnMobile?: boolean;
}

interface ToolbarSeparatorConfig {
  type: 'separator';
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

export interface ToolbarTableConfig {
  type: 'table-insert';
}

export type ToolbarItemConfig =
  | ToolbarToolConfig
  | ToolbarSeparatorConfig
  | ToolbarHeadingConfig
  | ToolbarLinkConfig
  | ToolbarHighlightConfig
  | ToolbarTableConfig;

export const TOOLBAR_TOOLS: readonly ToolbarItemConfig[] = [
  { type: 'heading-dropdown' },
  { type: 'separator' },
  {
    icon: Bold,
    label: 'Bold',
    action: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive('bold'),
    shortcut: 'Ctrl+B',
  },
  {
    icon: Italic,
    label: 'Italic',
    action: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive('italic'),
    shortcut: 'Ctrl+I',
  },
  {
    icon: Underline,
    label: 'Underline',
    action: (editor) => editor.chain().focus().toggleUnderline().run(),
    isActive: (editor) => editor.isActive('underline'),
    shortcut: 'Ctrl+U',
  },
  {
    icon: Strikethrough,
    label: 'Strikethrough',
    action: (editor) => editor.chain().focus().toggleStrike().run(),
    isActive: (editor) => editor.isActive('strike'),
    shortcut: 'Ctrl+Shift+S',
  },
  { type: 'separator' },
  {
    icon: List,
    label: 'Bullet List',
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    icon: ListOrdered,
    label: 'Numbered List',
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    icon: CheckSquare,
    label: 'Task List',
    action: (editor) => editor.chain().focus().toggleTaskList().run(),
    isActive: (editor) => editor.isActive('taskList'),
  },
  { type: 'separator' },
  {
    icon: Code,
    label: 'Inline Code',
    action: (editor) => editor.chain().focus().toggleCode().run(),
    isActive: (editor) => editor.isActive('code'),
    shortcut: 'Ctrl+E',
    hideOnMobile: true,
  },
  {
    icon: CodeXml,
    label: 'Code Block',
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: (editor) => editor.isActive('codeBlock'),
    shortcut: 'Ctrl+Alt+C',
    hideOnMobile: true,
  },
  { type: 'separator' },
  { type: 'link-popover', shortcut: 'Ctrl+K' },
  { type: 'highlight-picker' },
  {
    icon: SuperscriptIcon,
    label: 'Superscript',
    action: (editor) => editor.chain().focus().toggleSuperscript().run(),
    isActive: (editor) => editor.isActive('superscript'),
    shortcut: 'Ctrl+.',
    hideOnMobile: true,
  },
  {
    icon: SubscriptIcon,
    label: 'Subscript',
    action: (editor) => editor.chain().focus().toggleSubscript().run(),
    isActive: (editor) => editor.isActive('subscript'),
    shortcut: 'Ctrl+,',
    hideOnMobile: true,
  },
  { type: 'table-insert' },
  {
    icon: Minus,
    label: 'Horizontal Rule',
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
    isActive: () => false,
    hideOnMobile: true,
  },
  { type: 'separator' },
  {
    icon: Undo,
    label: 'Undo',
    action: (editor) => editor.chain().focus().undo().run(),
    isActive: () => false,
    disabled: (editor) => !editor.can().undo(),
    hideOnMobile: true,
  },
  {
    icon: Redo,
    label: 'Redo',
    action: (editor) => editor.chain().focus().redo().run(),
    isActive: () => false,
    disabled: (editor) => !editor.can().redo(),
    hideOnMobile: true,
  },
];
