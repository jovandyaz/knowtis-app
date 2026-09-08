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

type SharedNoteActionsVariant = 'mobile' | 'desktop';

const ICON_BUTTON_CLASSES: Record<SharedNoteActionsVariant, string> = {
  mobile: 'h-7 w-7 text-(--muted-foreground) hover:text-(--foreground)',
  desktop: 'h-8 w-8 text-(--muted-foreground) hover:text-(--foreground)',
};

interface SharedNoteActionProps {
  variant: SharedNoteActionsVariant;
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}

function SharedNoteAction({
  variant,
  label,
  icon: Icon,
  disabled,
  onClick,
}: SharedNoteActionProps) {
  const button = (
    <Button
      variant="ghost"
      size="icon"
      className={ICON_BUTTON_CLASSES[variant]}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  if (variant === 'mobile') {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export interface SharedNoteActionsProps {
  variant: SharedNoteActionsVariant;
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
  variant,
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
        variant={variant}
        label={tCommon('buttons.copyLink')}
        icon={copied ? Check : Share2}
        disabled={false}
        onClick={onCopyLink}
      />
      {(canEdit || isEditing) && (
        <SharedNoteAction
          variant={variant}
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
