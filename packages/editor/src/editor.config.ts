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

/**
 * Tier at which a tool leaves the row for the overflow menu as the toolbar
 * container narrows: `early` tools go first, `late` tools only when the row is
 * still too wide without them.
 */
export type ToolbarFold = 'early' | 'late';

/**
 * Container widths (px) below which each tier folds. `early` is the width of
 * the full row; `late` is the width of the row once the early tier has folded.
 * Measured in the browser: re-measure whenever `TOOLBAR_TOOLS` gains or loses
 * an entry, or the row overflows again in the gap between the two tiers.
 */
export const TOOLBAR_FOLD_WIDTHS: Readonly<Record<ToolbarFold, number>> = {
  early: 864,
  late: 640,
};

export interface ToolbarToolConfig {
  icon: typeof Bold;
  labelKey: ParseKeys<'notes'>;
  action: (editor: Editor) => void;
  /** Present on toggles only; one-shot actions (undo, insert rule) omit it. */
  isActive?: (editor: Editor) => boolean;
  disabled?: (editor: Editor) => boolean;
  shortcut?: string;
  fold?: ToolbarFold;
}

export interface ToolbarSeparatorConfig {
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
    fold: 'late',
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    icon: ListOrdered,
    labelKey: 'editor.toolbar.numberedList',
    fold: 'late',
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    icon: CheckSquare,
    labelKey: 'editor.toolbar.taskList',
    fold: 'late',
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
    fold: 'early',
  },
  {
    icon: CodeXml,
    labelKey: 'editor.toolbar.codeBlock',
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: (editor) => editor.isActive('codeBlock'),
    shortcut: 'Ctrl+Alt+C',
    fold: 'early',
  },
  { type: 'separator' },
  { type: 'link-popover', shortcut: 'Ctrl+K' },
  { type: 'highlight-picker' },
  {
    icon: SuperscriptIcon,
    labelKey: 'editor.toolbar.superscript',
    action: (editor) => editor.chain().focus().toggleSuperscript().run(),
    isActive: (editor) => editor.isActive('superscript'),
    shortcut: 'Ctrl+.',
    fold: 'early',
  },
  {
    icon: SubscriptIcon,
    labelKey: 'editor.toolbar.subscript',
    action: (editor) => editor.chain().focus().toggleSubscript().run(),
    isActive: (editor) => editor.isActive('subscript'),
    shortcut: 'Ctrl+,',
    fold: 'early',
  },
  {
    icon: Table2,
    labelKey: 'editor.table.insert',
    fold: 'late',
    action: (editor) => editor.chain().focus().insertTable(DEFAULT_TABLE).run(),
  },
  { type: 'image-button' },
  {
    icon: Minus,
    labelKey: 'editor.toolbar.horizontalRule',
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
    fold: 'early',
  },
  { type: 'separator' },
  {
    icon: Undo,
    labelKey: 'editor.toolbar.undo',
    action: (editor) => editor.chain().focus().undo().run(),
    disabled: (editor) => !editor.can().undo(),
    fold: 'early',
  },
  {
    icon: Redo,
    labelKey: 'editor.toolbar.redo',
    action: (editor) => editor.chain().focus().redo().run(),
    disabled: (editor) => !editor.can().redo(),
    fold: 'early',
  },
];
