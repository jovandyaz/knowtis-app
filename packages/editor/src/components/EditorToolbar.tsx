import { memo, useRef } from 'react';
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
  TOOLBAR_FOLD_WIDTHS,
  TOOLBAR_TOOLS,
  type ToolbarItemConfig,
  type ToolbarSeparatorConfig,
  type ToolbarToolConfig,
} from '../editor.config';
import { useElementWidth } from '../hooks/useElementWidth';
import { useMenuFocusReturn } from '../hooks/useMenuFocusReturn';
import { HeadingDropdown } from './HeadingDropdown';
import { HighlightPicker } from './HighlightPicker';
import { LinkPopover } from './LinkPopover';
import { toolbarButtonClasses } from './toolbar-button.styles';

type MenuItem = ToolbarToolConfig | ToolbarSeparatorConfig;

interface EditorToolbarProps {
  editor: Editor | null;
  onVoiceNote?: (() => void) | undefined;
  onAskAI?: (() => void) | undefined;
  onAddImage?: (() => void) | undefined;
}

function isTool(item: ToolbarItemConfig): item is ToolbarToolConfig {
  return !('type' in item);
}

function isSeparator(item: ToolbarItemConfig): item is ToolbarSeparatorConfig {
  return 'type' in item && item.type === 'separator';
}

function isFolded(tool: ToolbarToolConfig, width: number | null): boolean {
  if (tool.fold === undefined) {
    return false;
  }
  return width === null || width < TOOLBAR_FOLD_WIDTHS[tool.fold];
}

function withoutDanglingSeparators<T extends ToolbarItemConfig>(
  items: readonly T[]
): T[] {
  const result: T[] = [];
  for (const item of items) {
    const previous = result[result.length - 1];
    if (isSeparator(item) && (!previous || isSeparator(previous))) {
      continue;
    }
    result.push(item);
  }
  const last = result[result.length - 1];
  if (last && isSeparator(last)) {
    result.pop();
  }
  return result;
}

/**
 * Separators stay in both lists so each side keeps the original grouping;
 * the ones left without tools around them are dropped afterwards.
 */
function splitToolbar(width: number | null) {
  const row = withoutDanglingSeparators(
    TOOLBAR_TOOLS.filter((item) => !isTool(item) || !isFolded(item, width))
  );
  const menu = withoutDanglingSeparators(
    TOOLBAR_TOOLS.filter(
      (item): item is MenuItem =>
        isSeparator(item) || (isTool(item) && isFolded(item, width))
    )
  );
  return { row, menu };
}

interface ToolbarButtonProps {
  editor: Editor;
  tool: ToolbarToolConfig;
}

function ToolbarButton({ editor, tool }: ToolbarButtonProps) {
  const { t: tNotes } = useTranslation('notes');
  const Icon = tool.icon;
  const label = tNotes(tool.labelKey);
  const isToggle = tool.isActive !== undefined;
  const isActive = tool.isActive?.(editor) ?? false;
  const tooltipLabel = tool.shortcut ? `${label} (${tool.shortcut})` : label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={toolbarButtonClasses(isActive)}
          onClick={() => tool.action(editor)}
          disabled={tool.disabled?.(editor) ?? false}
          aria-label={label}
          aria-pressed={isToggle ? isActive : undefined}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarSeparator() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

interface ToolbarOverflowMenuProps {
  editor: Editor;
  items: readonly MenuItem[];
}

function ToolbarOverflowMenu({ editor, items }: ToolbarOverflowMenuProps) {
  const { t: tNotes } = useTranslation('notes');
  const { markSelected, onCloseAutoFocus } = useMenuFocusReturn();
  const label = tNotes('editor.toolbar.moreTools');
  const hasActiveTool = items.some(
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
              className={toolbarButtonClasses(hasActiveTool)}
              aria-label={label}
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="bottom"
        align="end"
        sideOffset={8}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {items.map((item, index) => {
          if (!isTool(item)) {
            return <DropdownMenuSeparator key={`sep-${index}`} />;
          }
          const Icon = item.icon;
          const content = (
            <>
              <Icon className="h-4 w-4" />
              <span>{tNotes(item.labelKey)}</span>
              {item.shortcut && (
                <span className="ml-auto pl-4 text-xs text-muted-foreground">
                  {item.shortcut}
                </span>
              )}
            </>
          );
          const disabled = item.disabled?.(editor) ?? false;
          const onSelect = () => {
            markSelected();
            item.action(editor);
          };

          return item.isActive ? (
            <DropdownMenuCheckboxItem
              key={item.labelKey}
              checked={item.isActive(editor)}
              disabled={disabled}
              onSelect={onSelect}
            >
              {content}
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuItem
              key={item.labelKey}
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

interface ToolbarBodyProps extends Omit<EditorToolbarProps, 'editor'> {
  editor: Editor;
}

function ToolbarBody({
  editor,
  onVoiceNote,
  onAskAI,
  onAddImage,
}: ToolbarBodyProps) {
  const { t: tNotes } = useTranslation('notes');
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const { row, menu } = splitToolbar(width);

  // Tiptap v3 no longer re-renders `useEditor` consumers per transaction, and
  // every button below reads `isActive`/`can()` during render, so the toolbar
  // has to subscribe to transactions itself or its state goes stale.
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'pointer-events-none z-10 w-full',
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
        {row.map((item, index) => {
          if (isTool(item)) {
            return (
              <ToolbarButton key={item.labelKey} editor={editor} tool={item} />
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
            case 'image-button':
              return onAddImage ? (
                <Tooltip key="image">
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={toolbarButtonClasses(false)}
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
        {menu.length > 0 && (
          <>
            <ToolbarSeparator />
            <ToolbarOverflowMenu editor={editor} items={menu} />
          </>
        )}
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
}

export const EditorToolbar = memo(function EditorToolbar({
  editor,
  ...props
}: EditorToolbarProps) {
  if (!editor) {
    return null;
  }
  return <ToolbarBody editor={editor} {...props} />;
});
