import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useEditorState, type Editor } from '@tiptap/react';
import { Ellipsis, Image as ImageIcon, Mic, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

import {
  TOOLBAR_TOOLS,
  type ToolbarItemConfig,
  type ToolbarSeparatorConfig,
  type ToolbarToolConfig,
} from '../editor.config';
import { HeadingDropdown } from './HeadingDropdown';
import { HighlightPicker } from './HighlightPicker';
import { LinkPopover } from './LinkPopover';
import { TableInsertButton } from './TableInsertButton';

/**
 * Container width at which every tool fits in a single row (the full pill
 * measures ~840px). Below it, secondary tools fold into the overflow menu.
 */
const EXPANDED_INLINE = '@min-[54rem]:inline-flex';
const EXPANDED_BLOCK = '@min-[54rem]:block';
const COLLAPSED_ONLY = '@min-[54rem]:hidden';

type SecondaryItem = ToolbarToolConfig | ToolbarSeparatorConfig;

function isTool(item: ToolbarItemConfig): item is ToolbarToolConfig {
  return !('type' in item);
}

function isSecondary(item: ToolbarItemConfig): item is SecondaryItem {
  if (isTool(item)) {
    return item.secondary === true;
  }
  return item.type === 'separator' && item.secondary === true;
}

const SECONDARY_ITEMS = TOOLBAR_TOOLS.filter(isSecondary);

interface EditorToolbarProps {
  editor: Editor | null;
  onVoiceNote?: (() => void) | undefined;
  onAskAI?: (() => void) | undefined;
  onAddImage?: (() => void) | undefined;
}

interface ToolbarButtonProps {
  editor: Editor;
  tool: ToolbarToolConfig;
}

function ToolbarButton({ editor, tool }: ToolbarButtonProps) {
  const Icon = tool.icon;
  const isToggle = tool.isActive !== undefined;
  const isActive = tool.isActive?.(editor) ?? false;
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
            tool.secondary && cn('hidden', EXPANDED_INLINE)
          )}
          onClick={() => tool.action(editor)}
          disabled={isDisabled}
          aria-label={tool.label}
          aria-pressed={isToggle ? isActive : undefined}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarSeparator({ className }: { className?: string | undefined }) {
  return (
    <div className={cn('mx-1 h-4 w-px bg-border max-md:hidden', className)} />
  );
}

function ToolbarOverflowMenu({ editor }: { editor: Editor }) {
  const { t: tNotes } = useTranslation('notes');
  const label = tNotes('editor.toolbar.moreTools');
  const hasActiveTool = SECONDARY_ITEMS.some(
    (item) => isTool(item) && item.isActive?.(editor)
  );

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-8 shrink-0 rounded-full p-0 transition-all',
                COLLAPSED_ONLY,
                hasActiveTool
                  ? 'bg-foreground text-background hover:bg-foreground/90'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              aria-label={label}
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end" sideOffset={8}>
        {SECONDARY_ITEMS.map((item, index) => {
          if (!isTool(item)) {
            return <DropdownMenuSeparator key={`sep-${index}`} />;
          }
          const Icon = item.icon;
          const content = (
            <>
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="ml-auto pl-4 text-xs text-muted-foreground">
                  {item.shortcut}
                </span>
              )}
            </>
          );
          const disabled = item.disabled?.(editor) ?? false;
          const onSelect = () => item.action(editor);

          return item.isActive ? (
            <DropdownMenuCheckboxItem
              key={item.label}
              checked={item.isActive(editor)}
              disabled={disabled}
              onSelect={onSelect}
            >
              {content}
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuItem
              key={item.label}
              className="pr-8"
              disabled={disabled}
              onSelect={onSelect}
            >
              {content}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const EditorToolbar = memo(function EditorToolbar({
  editor,
  onVoiceNote,
  onAskAI,
  onAddImage,
}: EditorToolbarProps) {
  const { t: tNotes } = useTranslation('notes');

  // Tiptap v3 no longer re-renders `useEditor` consumers per transaction, and
  // every button below reads `isActive`/`can()` during render, so the toolbar
  // has to subscribe to transactions itself or its state goes stale.
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });

  if (!editor) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        '@container pointer-events-none z-10 w-full',
        'sticky top-0 mb-4',
        'max-md:fixed max-md:bottom-3 max-md:left-0 max-md:right-0 max-md:top-auto max-md:mb-0 max-md:px-4 max-md:pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <div
        className={cn(
          'pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/50 bg-background/80 p-1 shadow-lg shadow-black/5 backdrop-blur-md scrollbar-none dark:bg-muted/30',
          'max-md:max-w-[calc(100vw-2rem)] max-md:rounded-2xl'
        )}
      >
        {onAskAI && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-full p-0 text-(--primary) transition-all hover:bg-(--primary)/10 hover:text-(--primary)"
                  onClick={onAskAI}
                  aria-label={tNotes('ai.menu.askAI')}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tNotes('ai.menu.askAI')}</TooltipContent>
            </Tooltip>
            <ToolbarSeparator />
          </>
        )}
        {TOOLBAR_TOOLS.map((item, index) => {
          if (isTool(item)) {
            return (
              <ToolbarButton key={item.label} editor={editor} tool={item} />
            );
          }
          switch (item.type) {
            case 'separator':
              return (
                <ToolbarSeparator
                  key={`sep-${index}`}
                  className={
                    item.secondary ? cn('hidden', EXPANDED_BLOCK) : undefined
                  }
                />
              );
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
            case 'image-button':
              return onAddImage ? (
                <Tooltip key="image">
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={onAddImage}
                      aria-label={tNotes('ai.slash.image')}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{tNotes('ai.slash.image')}</TooltipContent>
                </Tooltip>
              ) : null;
            default: {
              const _exhaustive: never = item;
              throw new Error(
                `Unhandled toolbar item: ${JSON.stringify(_exhaustive)}`
              );
            }
          }
        })}
        <ToolbarSeparator className={COLLAPSED_ONLY} />
        <ToolbarOverflowMenu editor={editor} />
        {onVoiceNote && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-full p-0 text-(--primary) hover:bg-(--primary)/10 hover:text-(--primary)"
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
