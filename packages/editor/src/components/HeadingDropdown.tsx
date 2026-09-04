import { useTranslation } from 'react-i18next';

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

import { useMenuFocusReturn } from '../hooks/useMenuFocusReturn';
import { toolbarButtonClasses } from './toolbar-button.styles';

interface HeadingDropdownProps {
  editor: Editor;
}

const HEADING_OPTIONS = [
  { level: 0 as const, labelKey: 'editor.toolbar.paragraph', icon: Pilcrow },
  { level: 1 as const, labelKey: 'editor.toolbar.heading1', icon: Heading1 },
  { level: 2 as const, labelKey: 'editor.toolbar.heading2', icon: Heading2 },
  { level: 3 as const, labelKey: 'editor.toolbar.heading3', icon: Heading3 },
] as const;

export function HeadingDropdown({ editor }: HeadingDropdownProps) {
  const { t } = useTranslation('notes');
  const { markSelected, onCloseAutoFocus } = useMenuFocusReturn();
  const label = t('editor.toolbar.heading');
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
              className={toolbarButtonClasses(isAnyHeadingActive)}
              aria-label={label}
            >
              <Heading className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={8}
        onCloseAutoFocus={onCloseAutoFocus}
      >
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
                markSelected();
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
              <span>{t(option.labelKey)}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
