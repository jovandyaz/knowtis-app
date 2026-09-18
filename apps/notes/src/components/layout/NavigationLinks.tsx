import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import {
  NAV_COUNT,
  NAV_ICON_SLOT,
  NAV_LABEL,
  NAV_ROW,
  NAV_ROW_IDLE,
} from '@/components/organization/nav-row.styles';
import type { NavigationLink } from '@/config/navigation.config';
import { ROUTES } from '@/config/routes.config';
import { useStudyQueueAccess } from '@/hooks/useStudyQueueAccess';
import { BROWSER_TIME_ZONE } from '@/lib/browser-time-zone';

import { useStudyStats } from '@knowtis/data-access-artifacts';
import { cn } from '@knowtis/design-system';

/**
 * Navigation links props interface
 * @property {NavigationLink[]} links - The links to display
 * @property {() => void} onLinkClick - The function to call when a link is clicked
 */
interface NavigationLinksProps {
  links: NavigationLink[];
  onLinkClick?: () => void;
}

export function NavigationLinks({ links, onLinkClick }: NavigationLinksProps) {
  const { t } = useTranslation('common');
  const { isEnabled: isStudyEnabled } = useStudyQueueAccess();
  const stats = useStudyStats(BROWSER_TIME_ZONE, { enabled: isStudyEnabled });
  const dueCount = stats.data?.dueCount ?? 0;

  return (
    <nav className="py-2 px-3 flex flex-col gap-1">
      {links.map((link) => {
        const isStudyLink = link.to === ROUTES.STUDY;

        if (isStudyLink && !isStudyEnabled) {
          return null;
        }

        return (
          <Link
            key={link.labelKey}
            to={link.to}
            onClick={onLinkClick}
            className={cn(
              NAV_ROW,
              NAV_ROW_IDLE,
              'min-h-9 font-medium data-[status=active]:bg-muted data-[status=active]:text-foreground'
            )}
            {...link.linkProps}
          >
            <span className={NAV_ICON_SLOT} aria-hidden>
              <link.icon className="h-4 w-4" />
            </span>
            <span className={NAV_LABEL}>{t(link.labelKey)}</span>
            {isStudyLink && dueCount > 0 && (
              <span className={NAV_COUNT}>
                <span aria-hidden="true">{dueCount}</span>
                <span className="sr-only">
                  {t('labels.studyDueCount', { count: dueCount })}
                </span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
