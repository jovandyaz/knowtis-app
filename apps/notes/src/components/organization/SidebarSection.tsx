import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TOUCH_TARGET_HEIGHT_CLASS,
} from '@knowtis/design-system';
import { useCollapsible } from '@knowtis/shared-hooks';

const HEADER_CLASSES = `flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs leading-4 font-medium normal-case tracking-normal text-foreground dark:text-muted-foreground transition-colors dark:hover:text-foreground ${TOUCH_TARGET_HEIGHT_CLASS}`;

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
    <Collapsible
      open={!isCollapsed}
      onOpenChange={toggle}
      className="flex flex-col gap-1"
    >
      <CollapsibleTrigger
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
      </CollapsibleTrigger>

      <CollapsibleContent className="flex flex-col gap-0.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
