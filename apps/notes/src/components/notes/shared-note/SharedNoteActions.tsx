import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { Check, Eye, Pencil, Share2, type LucideIcon } from 'lucide-react';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';

const ICON_BUTTON_CLASSES =
  'h-7 w-7 text-(--muted-foreground) hover:text-(--foreground) md:h-8 md:w-8';

interface SharedNoteActionProps {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}

function SharedNoteAction({
  label,
  icon: Icon,
  disabled,
  onClick,
}: SharedNoteActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={ICON_BUTTON_CLASSES}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export interface SharedNoteActionsProps {
  canEdit: boolean;
  isEditing: boolean;
  isPreparingEdit: boolean;
  copied: boolean;
  offerSignIn: boolean;
  sharedPath: string;
  onCopyLink: () => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
}

export function SharedNoteActions({
  canEdit,
  isEditing,
  isPreparingEdit,
  copied,
  offerSignIn,
  sharedPath,
  onCopyLink,
  onStartEditing,
  onStopEditing,
}: SharedNoteActionsProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');

  return (
    <div className="flex items-center gap-1">
      <SharedNoteAction
        label={tCommon('buttons.copyLink')}
        icon={copied ? Check : Share2}
        disabled={false}
        onClick={onCopyLink}
      />
      {(canEdit || isEditing) && (
        <SharedNoteAction
          label={isEditing ? t('shared.viewButton') : t('shared.editButton')}
          icon={isEditing ? Eye : Pencil}
          disabled={isPreparingEdit}
          onClick={isEditing ? onStopEditing : onStartEditing}
        />
      )}
      {offerSignIn ? (
        <Link to={ROUTES.LOGIN} search={{ redirect: sharedPath }}>
          <Button variant="outline" size="sm">
            {t('shared.signIn')}
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
