import { useTranslation } from 'react-i18next';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useUpdateTag } from '@knowtis/data-access-notes';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@knowtis/design-system';
import { TAG_COLORS, type TagColor } from '@knowtis/shared-types';

import { tagSwatchClass } from './tag-colors';

const NO_COLOR_VALUE = 'none';

interface TagActionsMenuProps {
  tagId: string;
  path: string;
  color: TagColor | null;
  onRenameRequest: () => void;
  onDeleteRequest: () => void;
}

export function TagActionsMenu({
  tagId,
  path,
  color,
  onRenameRequest,
  onDeleteRequest,
}: TagActionsMenuProps) {
  const { t } = useTranslation('notes');
  const updateTag = useUpdateTag();

  const handleColorChange = (value: string) => {
    updateTag.mutate(
      {
        id: tagId,
        input: { color: value === NO_COLOR_VALUE ? null : (value as TagColor) },
      },
      { onError: () => toast.error(t('organization.tags.colorError')) }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-(--muted-foreground) hover:text-(--foreground) md:h-7 md:w-7"
          aria-label={t('organization.tags.actionsLabel', { tag: path })}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onRenameRequest}>
          <Pencil className="h-3.5 w-3.5 opacity-60" />
          {t('organization.tags.rename')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t('organization.tags.color')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={color ?? NO_COLOR_VALUE}
          onValueChange={handleColorChange}
        >
          {TAG_COLORS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              <span
                aria-hidden
                className={cn(
                  'inline-block size-[9px] shrink-0 rounded-full',
                  tagSwatchClass(option)
                )}
              />
              {t(`organization.tags.colors.${option}`)}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={NO_COLOR_VALUE}>
            <span
              aria-hidden
              className={cn(
                'inline-block size-[9px] shrink-0 rounded-full',
                tagSwatchClass(null)
              )}
            />
            {t('organization.tags.noColor')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-(--destructive) focus:bg-(--destructive)/10 focus:text-(--destructive)"
          onSelect={onDeleteRequest}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('organization.tags.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
