import type { LinkProps } from '@tanstack/react-router';

import type { LucideIcon } from 'lucide-react';
import { Home, Search } from 'lucide-react';

import type { enCommon } from '@knowtis/shared-i18n';

import type { FileRouteTypes } from '../routeTree.gen';

/** Flatten nested object keys into dot-notation string union */
type FlattenKeys<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: FlattenKeys<
        T[K],
        Prefix extends '' ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string]
  : Prefix;

type CommonKey = FlattenKeys<typeof enCommon>;

/**
 * Type-safe navigation link configuration
 * @property {LucideIcon} icon - The icon to display
 * @property {CommonKey} labelKey - The i18n translation key for the label (namespace: common)
 * @property {FileRouteTypes['to']} to - The route to navigate to
 * @property {Omit<LinkProps, 'to' | 'children'>} linkProps - Additional link props
 * @property {boolean} disabled - Whether the link is disabled
 * @property {CommonKey} tooltipKey - i18n translation key for tooltip text (namespace: common)
 */
export interface NavigationLink {
  icon: LucideIcon;
  labelKey: CommonKey;
  to: FileRouteTypes['to'];
  linkProps?: Omit<LinkProps, 'to' | 'children'>;
  disabled?: boolean;
  tooltipKey?: CommonKey;
}

/**
 * Main navigation links configuration
 */
export const NAVIGATION_LINKS: NavigationLink[] = [
  {
    icon: Home,
    labelKey: 'labels.home',
    to: '/',
  },
  {
    icon: Search,
    labelKey: 'labels.search',
    to: '/',
    disabled: true,
    tooltipKey: 'states.comingSoon',
  },
] as const satisfies NavigationLink[];
