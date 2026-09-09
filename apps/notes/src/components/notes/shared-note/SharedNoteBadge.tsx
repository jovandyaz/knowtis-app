import { useTranslation } from 'react-i18next';

import { Eye, Pencil } from 'lucide-react';

import { Badge } from '@knowtis/design-system';

interface SharedNoteBadgeProps {
  canEdit: boolean;
}

export function SharedNoteBadge({ canEdit }: SharedNoteBadgeProps) {
  const { t } = useTranslation('notes');

  return (
    <Badge variant={canEdit ? 'default' : 'secondary'}>
      {canEdit ? (
        <span className="flex items-center gap-1">
          <Pencil className="h-3 w-3" />
          {t('shared.editorBadge')}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {t('shared.viewOnlyBadge')}
        </span>
      )}
    </Badge>
  );
}
