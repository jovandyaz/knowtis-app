import { useTranslation } from 'react-i18next';

import { Mail } from 'lucide-react';

import { Switch } from '@knowtis/design-system';

interface EditorsCanShareToggleProps {
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function EditorsCanShareToggle({
  enabled,
  disabled,
  onToggle,
}: EditorsCanShareToggleProps) {
  const { t } = useTranslation('notes');

  return (
    <>
      <div className="border-t border-border" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">
                {t('share.editorsCanShare')}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('share.editorsCanShareToggleDesc')}
            </p>
          </div>

          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={disabled}
            title={
              enabled
                ? t('share.editorsCanShareTitle')
                : t('share.onlyYouCanShare')
            }
          />
        </div>
      </div>
    </>
  );
}
