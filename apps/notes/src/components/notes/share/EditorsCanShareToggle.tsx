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
  return (
    <>
      <div className="border-t border-border" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Editors can share</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Allow editors to invite others and manage access
            </p>
          </div>

          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={disabled}
            title={
              enabled
                ? 'Editors can share this note'
                : 'Only you can share this note'
            }
          />
        </div>
      </div>
    </>
  );
}
