import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, Users } from 'lucide-react';

import {
  Button,
  SegmentedControl,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@knowtis/design-system';
import { PERMISSION, type PermissionLevel } from '@knowtis/shared-types';

interface LinkAccessSectionProps {
  shareUrl: string;
  permission: PermissionLevel;
  disabled: boolean;
  onPermissionChange: (permission: PermissionLevel) => void;
}

export function LinkAccessSection({
  shareUrl,
  permission,
  disabled,
  onPermissionChange,
}: LinkAccessSectionProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const [copiedLink, setCopiedLink] = useState(false);

  const permissionOptions = [
    { value: PERMISSION.VIEWER, label: t('share.viewer') },
    { value: PERMISSION.EDITOR, label: t('share.editor') },
  ];

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{t('share.linkAccess')}</h3>
        </div>

        <SegmentedControl
          aria-label={t('share.linkAccess')}
          options={permissionOptions}
          value={permission}
          onValueChange={onPermissionChange}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-muted-foreground truncate">
            {shareUrl}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyLink}
              className="flex-shrink-0 h-8 w-8"
            >
              {copiedLink ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {copiedLink
              ? tCommon('buttons.copied')
              : tCommon('buttons.copyLink')}
          </TooltipContent>
        </Tooltip>
      </div>

      <p className="text-xs text-muted-foreground">
        {permission === PERMISSION.VIEWER
          ? t('share.viewerHelp')
          : t('share.editorHelp')}
      </p>
    </div>
  );
}
