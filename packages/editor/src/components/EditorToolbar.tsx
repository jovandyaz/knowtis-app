import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { Editor } from '@tiptap/react';
import { Mic } from 'lucide-react';
import { motion } from 'motion/react';

import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

import { TOOLBAR_TOOLS, type ToolbarToolConfig } from '../editor.config';
import { HeadingDropdown } from './HeadingDropdown';
import { HighlightPicker } from './HighlightPicker';
import { LinkPopover } from './LinkPopover';
import { TableInsertButton } from './TableInsertButton';

interface EditorToolbarProps {
  editor: Editor | null;
  onVoiceNote?: (() => void) | undefined;
}

interface ToolbarButtonProps {
  editor: Editor;
  tool: ToolbarToolConfig;
}

function ToolbarButton({ editor, tool }: ToolbarButtonProps) {
  const Icon = tool.icon;
  const isActive = tool.isActive(editor);
  const isDisabled = tool.disabled?.(editor) ?? false;
  const tooltipLabel = tool.shortcut
    ? `${tool.label} (${tool.shortcut})`
    : tool.label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 w-8 rounded-full p-0 transition-all shrink-0',
            isActive
              ? 'bg-foreground text-background hover:bg-foreground/90'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            tool.hideOnMobile && 'max-md:hidden'
          )}
          onClick={() => tool.action(editor)}
          disabled={isDisabled}
          aria-label={tool.label}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarSeparator() {
  return <div className="mx-1 h-4 w-px bg-border max-md:hidden" />;
}

export const EditorToolbar = memo(function EditorToolbar({
  editor,
  onVoiceNote,
}: EditorToolbarProps) {
  const { t: tNotes } = useTranslation('notes');

  if (!editor) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'z-10 mx-auto w-fit',
        'sticky top-0 mb-4',
        'max-md:fixed max-md:bottom-3 max-md:left-0 max-md:right-0 max-md:top-auto max-md:mb-0 max-md:w-full max-md:px-4 max-md:pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1 rounded-full border border-border/50 bg-background/80 p-1 shadow-lg shadow-black/5 backdrop-blur-md dark:bg-muted/30',
          'max-md:mx-auto max-md:w-fit max-md:max-w-[calc(100vw-2rem)] max-md:overflow-x-auto max-md:rounded-2xl max-md:scrollbar-none'
        )}
      >
        {TOOLBAR_TOOLS.map((item, index) => {
          if (!('type' in item)) {
            return (
              <ToolbarButton key={item.label} editor={editor} tool={item} />
            );
          }
          switch (item.type) {
            case 'separator':
              return <ToolbarSeparator key={`sep-${index}`} />;
            case 'heading-dropdown':
              return <HeadingDropdown key="heading" editor={editor} />;
            case 'link-popover':
              return (
                <LinkPopover
                  key="link"
                  editor={editor}
                  shortcut={item.shortcut}
                />
              );
            case 'highlight-picker':
              return <HighlightPicker key="highlight" editor={editor} />;
            case 'table-insert':
              return <TableInsertButton key="table" editor={editor} />;
            default: {
              const _exhaustive: never = item;
              throw new Error(
                `Unhandled toolbar item: ${JSON.stringify(_exhaustive)}`
              );
            }
          }
        })}
        {onVoiceNote && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full p-0 text-(--primary) hover:bg-(--primary)/10 hover:text-(--primary)"
            onClick={onVoiceNote}
            aria-label={tNotes('ai.slash.voiceNote')}
          >
            <Mic className="h-4 w-4" />
          </Button>
        )}
      </div>
    </motion.div>
  );
});
