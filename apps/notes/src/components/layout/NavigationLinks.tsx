import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import type { NavigationLink } from '@/config/navigation.config';

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

  return (
    <nav className="py-2 px-4 flex flex-col gap-1">
      {links.map((link) => {
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
            {t(link.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
