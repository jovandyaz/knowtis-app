import type { Editor } from '@tiptap/react';
import { Heading, Heading1, Heading2, Heading3, Pilcrow } from 'lucide-react';

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

interface HeadingDropdownProps {
  editor: Editor;
}

const HEADING_OPTIONS = [
  { level: 0 as const, label: 'Paragraph', icon: Pilcrow },
  { level: 1 as const, label: 'Heading 1', icon: Heading1 },
  { level: 2 as const, label: 'Heading 2', icon: Heading2 },
  { level: 3 as const, label: 'Heading 3', icon: Heading3 },
];

export function HeadingDropdown({ editor }: HeadingDropdownProps) {
  const isAnyHeadingActive = [1, 2, 3].some((level) =>
    editor.isActive('heading', { level })
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
                'h-8 w-8 rounded-full p-0 transition-all',
                isAnyHeadingActive
                  ? 'bg-foreground text-background hover:bg-foreground/90'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              aria-label="Heading"
            >
              <Heading className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Heading</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="start" sideOffset={8}>
        {HEADING_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive =
            option.level === 0
              ? !isAnyHeadingActive
              : editor.isActive('heading', { level: option.level });

          return (
            <DropdownMenuItem
              key={option.level}
              className={cn(isActive && 'bg-(--muted)')}
              onSelect={() => {
                if (option.level === 0) {
                  editor.chain().focus().setParagraph().run();
                } else {
                  editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: option.level })
                    .run();
                }
              }}
            >
              <Icon className="h-4 w-4" />
              <span>{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
