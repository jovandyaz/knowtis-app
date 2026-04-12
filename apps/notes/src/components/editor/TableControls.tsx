import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';
import {
  Columns3,
  PanelTop,
  Plus,
  Rows3,
  Settings2,
  Trash2,
} from 'lucide-react';

import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

const TABLE_CONTROL_OFFSET = {
  EDGE_GAP: 4,
  ADD_ROW_HALF_WIDTH: 16,
  ADD_COLUMN_HALF_HEIGHT: 16,
  MORE_BUTTON_OFFSET_Y: 34,
  MORE_BUTTON_OFFSET_X: 28,
} as const;

const floatingButtonClasses = cn(
  'flex items-center justify-center rounded-md border border-border/60 bg-background/90',
  'text-muted-foreground shadow-sm backdrop-blur-sm',
  'transition-all duration-150',
  'hover:bg-foreground hover:text-background hover:border-foreground',
  'focus:outline-none focus:ring-2 focus:ring-primary/50'
);

interface TableBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ActiveTable {
  pos: number;
  dom: HTMLElement;
}

interface TableControlsProps {
  editor: Editor;
}

function findActiveTable(editor: Editor): ActiveTable | null {
  const { $anchor } = editor.state.selection;

  for (let depth = $anchor.depth; depth > 0; depth -= 1) {
    const node = $anchor.node(depth);
    if (node.type.name !== 'table') {
      continue;
    }
    const pos = $anchor.before(depth);
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      return { pos, dom };
    }
  }

  return null;
}

function boundsEqual(a: TableBounds | null, b: TableBounds | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}

function getBounds(dom: HTMLElement): TableBounds {
  const rect = dom.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

interface FloatingTableButtonProps {
  icon: LucideIcon;
  ariaLabel: string;
  tooltip: string;
  tooltipSide: 'top' | 'bottom' | 'left' | 'right';
  sizeClasses: string;
  position: { top: number; left: number };
  onClick: () => void;
}

function FloatingTableButton({
  icon: Icon,
  ariaLabel,
  tooltip,
  tooltipSide,
  sizeClasses,
  position,
  onClick,
}: FloatingTableButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            floatingButtonClasses,
            'pointer-events-auto absolute',
            sizeClasses
          )}
          style={position}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function TableControls({ editor }: TableControlsProps) {
  const { t } = useTranslation('notes');
  const activeTable = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e.isEditable || !e.isActive('table')) {
        return null;
      }
      return findActiveTable(e);
    },
    equalityFn: (a, b) => a?.dom === b?.dom && a?.pos === b?.pos,
  });

  const [bounds, setBounds] = useState<TableBounds | null>(null);
  const frameRef = useRef<number | null>(null);

  const updateBounds = useCallback((dom: HTMLElement | null) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      const next = dom ? getBounds(dom) : null;
      setBounds((prev) => (boundsEqual(prev, next) ? prev : next));
    });
  }, []);

  useEffect(() => {
    if (!activeTable) {
      updateBounds(null);
      return;
    }

    const { dom } = activeTable;
    updateBounds(dom);

    const resizeObserver = new ResizeObserver(() => updateBounds(dom));
    resizeObserver.observe(dom);

    const handleViewportChange = () => updateBounds(dom);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [activeTable, updateBounds]);

  if (!bounds) {
    return null;
  }

  const addRowAfter = () => editor.chain().focus().addRowAfter().run();
  const addColumnAfter = () => editor.chain().focus().addColumnAfter().run();

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden="false">
      <FloatingTableButton
        icon={Plus}
        ariaLabel={t('editor.table.addRowBelow')}
        tooltip={t('editor.table.addRow')}
        tooltipSide="bottom"
        sizeClasses="h-6 w-8"
        position={{
          top: bounds.top + bounds.height + TABLE_CONTROL_OFFSET.EDGE_GAP,
          left:
            bounds.left +
            bounds.width / 2 -
            TABLE_CONTROL_OFFSET.ADD_ROW_HALF_WIDTH,
        }}
        onClick={addRowAfter}
      />

      <FloatingTableButton
        icon={Plus}
        ariaLabel={t('editor.table.addColumnRight')}
        tooltip={t('editor.table.addColumn')}
        tooltipSide="right"
        sizeClasses="h-8 w-6"
        position={{
          top:
            bounds.top +
            bounds.height / 2 -
            TABLE_CONTROL_OFFSET.ADD_COLUMN_HALF_HEIGHT,
          left: bounds.left + bounds.width + TABLE_CONTROL_OFFSET.EDGE_GAP,
        }}
        onClick={addColumnAfter}
      />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  floatingButtonClasses,
                  'pointer-events-auto absolute h-7 w-7 rounded-lg',
                  'hover:scale-105 active:scale-95'
                )}
                style={{
                  top: bounds.top - TABLE_CONTROL_OFFSET.MORE_BUTTON_OFFSET_Y,
                  left:
                    bounds.left +
                    bounds.width -
                    TABLE_CONTROL_OFFSET.MORE_BUTTON_OFFSET_X,
                }}
                aria-label={t('editor.table.options')}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            {t('editor.table.options')}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>{t('editor.table.sectionRow')}</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().addRowBefore().run()}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t('editor.table.addRowAbove')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={addRowAfter}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t('editor.table.addRowBelow')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="text-destructive focus:text-destructive"
          >
            <Rows3 className="mr-2 h-3.5 w-3.5" />
            {t('editor.table.deleteRow')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            {t('editor.table.sectionColumn')}
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().addColumnBefore().run()}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t('editor.table.addColumnLeft')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={addColumnAfter}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t('editor.table.addColumnRight')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="text-destructive focus:text-destructive"
          >
            <Columns3 className="mr-2 h-3.5 w-3.5" />
            {t('editor.table.deleteColumn')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            {t('editor.table.sectionTable')}
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          >
            <PanelTop className="mr-2 h-3.5 w-3.5" />
            {t('editor.table.toggleHeaderRow')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {t('editor.table.deleteTable')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>,
    document.body
  );
}
