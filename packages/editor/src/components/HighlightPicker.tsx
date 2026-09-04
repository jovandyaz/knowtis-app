import { useTranslation } from 'react-i18next';

import type { Editor } from '@tiptap/react';
import { Highlighter, X } from 'lucide-react';

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

import { toolbarButtonClasses } from './toolbar-button.styles';

const HIGHLIGHT_COLORS = [
  { labelKey: 'editor.highlight.colorYellow', value: '#fef08a' },
  { labelKey: 'editor.highlight.colorGreen', value: '#bbf7d0' },
  { labelKey: 'editor.highlight.colorBlue', value: '#bfdbfe' },
  { labelKey: 'editor.highlight.colorPink', value: '#fbcfe8' },
  { labelKey: 'editor.highlight.colorOrange', value: '#fed7aa' },
  { labelKey: 'editor.highlight.colorPurple', value: '#e9d5ff' },
] as const;

interface HighlightPickerProps {
  editor: Editor;
}

export function HighlightPicker({ editor }: HighlightPickerProps) {
  const { t } = useTranslation('notes');
  const isActive = editor.isActive('highlight');
  const label = t('editor.highlight.label');

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={toolbarButtonClasses(isActive)}
              aria-label={label}
            >
              <Highlighter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              className={cn(
                'h-6 w-6 rounded-full border border-border/50 transition-transform hover:scale-110',
                editor.isActive('highlight', { color: color.value }) &&
                  'ring-2 ring-primary ring-offset-1'
              )}
              style={{ backgroundColor: color.value }}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .toggleHighlight({ color: color.value })
                  .run()
              }
              aria-label={t(color.labelKey)}
            />
          ))}
          {isActive && (
            <button
              type="button"
              className="h-6 w-6 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              onClick={() => editor.chain().focus().unsetHighlight().run()}
              aria-label={t('editor.highlight.remove')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
