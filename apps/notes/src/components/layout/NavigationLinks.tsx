import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { NAV_COUNT, NAV_LABEL } from '@/components/organization/nav-row.styles';
import type { NavigationLink } from '@/config/navigation.config';
import { ROUTES } from '@/config/routes.config';
import { useStudyQueueAccess } from '@/hooks/useStudyQueueAccess';
import { BROWSER_TIME_ZONE } from '@/lib/browser-time-zone';

import { useStudyStats } from '@knowtis/data-access-artifacts';

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
    <nav className="py-2 px-4 flex flex-col gap-1">
      {links.map((link) => {
        const isStudyLink = link.to === ROUTES.STUDY;

        if (isStudyLink && !isStudyEnabled) {
          return null;
        }

        if (link.disabled) {
          return (
            <span
              key={link.labelKey}
              title={link.tooltipKey ? t(link.tooltipKey) : undefined}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
            >
              <link.icon className="h-4 w-4" />
              {t(link.labelKey)}
            </span>
          );
        }

        return (
          <Link
            key={link.labelKey}
            to={link.to}
            onClick={onLinkClick}
            activeProps={{
              className: 'bg-muted text-foreground',
            }}
            inactiveProps={{
              className:
                'text-muted-foreground hover:bg-primary/5 hover:text-primary',
            }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all cursor-pointer"
            {...link.linkProps}
          >
            <link.icon className="h-4 w-4" />
            <span className={NAV_LABEL}>{t(link.labelKey)}</span>
            {isStudyLink && dueCount > 0 && (
              <span className={NAV_COUNT}>{dueCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
