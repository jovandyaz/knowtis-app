import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo,
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

type ToolbarItemConfig = ToolbarToolConfig | ToolbarSeparatorConfig;

export const TOOLBAR_TOOLS: readonly ToolbarItemConfig[] = [
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
] as const;
