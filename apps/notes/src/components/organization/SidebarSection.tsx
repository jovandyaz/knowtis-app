import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';

import { useCollapsible } from '@knowtis/shared-hooks';

const HEADER_CLASSES =
  'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-muted-foreground';

interface SidebarSectionProps {
  title: string;
  storageKey: string;
  children: ReactNode;
}

export function SidebarSection({
  title,
  storageKey,
  children,
}: SidebarSectionProps) {
  const { t } = useTranslation('common');
  const { isCollapsed, toggle } = useCollapsible(storageKey);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? t('labels.expand') : t('labels.collapse')}
        className={HEADER_CLASSES}
      >
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        <ChevronDown
          aria-hidden
          className={`h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none ${
            isCollapsed ? '-rotate-90' : ''
          }`}
        />
      </button>

      {!isCollapsed && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}
