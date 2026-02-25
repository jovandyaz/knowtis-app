import { useTranslation } from 'react-i18next';

import { STORAGE_KEYS } from '@/config';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Badge } from '@knowtis/design-system';
import { useCollapsible } from '@knowtis/shared-hooks';

export function SidebarFlashcardsSection() {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const { isCollapsed, toggle: toggleCollapsed } = useCollapsible(
    STORAGE_KEYS.SIDEBAR_FLASHCARDS_COLLAPSED,
    true
  );

  const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {tCommon('labels.flashcards')}
      </span>

      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center gap-0.5 min-w-0">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-md p-1 text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer"
            title={
              isCollapsed
                ? tCommon('labels.expand')
                : tCommon('labels.collapse')
            }
          >
            <ChevronIcon className="h-3.5 w-3.5" />
          </button>
          <span className="flex-1 truncate rounded-md px-1.5 py-1 text-sm font-medium text-muted-foreground/50 cursor-not-allowed">
            {tCommon('labels.flashcards')}
          </span>
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {tCommon('states.comingSoon')}
        </Badge>
      </div>

      {!isCollapsed && (
        <div className="px-2 py-1">
          <span className="text-xs text-muted-foreground/60">
            {t('sidebar.flashcardsComingSoon')}
          </span>
        </div>
      )}
    </div>
  );
}
