import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, Users } from 'lucide-react';

import { Button, cn } from '@knowtis/design-system';
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
  ] as const;

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

        <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md">
          {permissionOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onPermissionChange(option.value)}
              disabled={disabled}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                permission === option.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-muted-foreground truncate">
            {shareUrl}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="flex-shrink-0 gap-2"
        >
          {copiedLink ? (
            <>
              <Check className="h-4 w-4 text-emerald-500" />
              <span>{tCommon('buttons.copied')}</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span>{tCommon('buttons.copyLink')}</span>
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {permission === PERMISSION.VIEWER
          ? t('share.viewerHelp')
          : t('share.editorHelp')}
      </p>
    </div>
  );
}
