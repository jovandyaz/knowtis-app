import { useTranslation } from 'react-i18next';

import type { Editor } from '@tiptap/react';
import { Table2 } from 'lucide-react';

import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

const DEFAULT_TABLE = { rows: 3, cols: 3, withHeaderRow: true } as const;

interface TableInsertButtonProps {
  editor: Editor;
}

export function TableInsertButton({ editor }: TableInsertButtonProps) {
  const { t } = useTranslation('notes');
  const isActive = editor.isActive('table');
  const label = t('editor.table.insert');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 w-8 rounded-full p-0 transition-all shrink-0 max-md:hidden',
            isActive
              ? 'bg-foreground text-background hover:bg-foreground/90'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          onClick={() =>
            editor.chain().focus().insertTable(DEFAULT_TABLE).run()
          }
          aria-label={label}
        >
          <Table2 className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
